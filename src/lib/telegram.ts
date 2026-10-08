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

export async function sendMessageSplit(
  env: Env,
  chatId: number,
  text: string,
  parseMode: 'HTML' = 'HTML'
): Promise<void> {
  const MAX = 4000;

  if (text.length <= MAX) {
    await sendMessage(env, { chatId, text, parseMode });
    return;
  }

  const parts: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > MAX) {
      parts.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) parts.push(current);

  for (let i = 0; i < parts.length; i++) {
    const header =
      parts.length > 1 ? `<i>[${i + 1}/${parts.length}]</i>\n` : '';
    await sendMessage(env, {
      chatId,
      text: header + parts[i],
      parseMode,
    });
  }
}

export async function sendTyping(
  env: Env,
  chatId: number
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  try {
    await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
      }
    );
  } catch {
  }
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