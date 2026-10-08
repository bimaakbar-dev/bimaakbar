import type { Env } from '../types';

interface SendMessageOptions {
  chatId?: number | string;
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disablePreview?: boolean;
}

export async function sendMessage(
  env: Env,
  options: SendMessageOptions
): Promise<boolean> {
  const chatId = options.chatId ?? env.TELEGRAM_CHAT_ID;

  if (!env.TELEGRAM_BOT_TOKEN || !chatId) {
    console.error('[Telegram] missing token or chat ID');
    return false;
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: options.text,
  };

  if (options.parseMode) body.parse_mode = options.parseMode;
  if (options.disablePreview !== false) body.disable_web_page_preview = true;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error(`[Telegram] HTTP ${res.status}: ${err.slice(0, 200)}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Telegram] fetch error:', err);
    return false;
  }
}

export async function setWebhook(
  env: Env,
  webhookUrl: string
): Promise<{ ok: boolean; description?: string }> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }),
  });

  const data = (await res.json()) as { ok: boolean; description?: string };
  return data;
}

export async function deleteWebhook(env: Env): Promise<boolean> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`;
  const res = await fetch(url, { method: 'POST' });
  const data = (await res.json()) as { ok: boolean };
  return data.ok;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function code(s: string): string {
  return `<code>${escapeHtml(s)}</code>`;
}

export function bold(s: string): string {
  return `<b>${escapeHtml(s)}</b>`;
}