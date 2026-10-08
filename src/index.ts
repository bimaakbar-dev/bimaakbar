import type { Env, TelegramUpdate, CommandContext } from './types';
import { registerAll, route, getAllCommands } from './lib/router';
import { allCommands } from './commands';
import { sendMessage, sendTyping } from './lib/telegram';
import { cleanupOldLogs, cleanupRateLimits } from './lib/state';

registerAll(allCommands);

function isAuthorized(env: Env, userId: number): boolean {
  const allowed = (env.TELEGRAM_CHAT_ID ?? '').trim();
  if (!allowed) return true;
  return String(userId) === allowed;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleTelegram(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const msg = update.message;
  if (!msg || !msg.text) {
    return jsonResponse({ ok: true, skipped: 'no message' });
  }

  const chatId = msg.chat.id;
  const userId = msg.from?.id ?? 0;
  const username = msg.from?.username ?? msg.from?.first_name ?? 'unknown';
  const text = msg.text;

  if (!isAuthorized(env, chatId)) {
    ctx.waitUntil(
      sendMessage(env, {
        chatId,
        text: `⛔ Chat ID ${chatId} tidak diizinkan.`,
      })
    );
    return jsonResponse({ ok: true });
  }

  ctx.waitUntil(
    (async () => {
      try {
        await sendTyping(env, chatId);

        const commandCtx: CommandContext = {
          chatId,
          userId,
          username,
          text,
          args: [],
          env,
        };

        const reply = await route(env, commandCtx);

        const MAX = 4000;
        if (reply.length <= MAX) {
          await sendMessage(env, {
            chatId,
            text: reply,
            parseMode: 'HTML',
          });
        } else {
          const parts: string[] = [];
          let current = '';

          for (const line of reply.split('\n')) {
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
              parts.length > 1
                ? `<i>[${i + 1}/${parts.length}]</i>\n`
                : '';
            await sendMessage(env, {
              chatId,
              text: header + parts[i],
              parseMode: 'HTML',
            });
          }
        }
      } catch (err) {
        console.error('[Webhook] processing error:', err);
        const errMsg = (err as Error).message ?? 'unknown';
        await sendMessage(env, {
          chatId,
          text: `❌ Error: <code>${errMsg.slice(0, 200)}</code>`,
          parseMode: 'HTML',
        });
      }
    })()
  );

  return jsonResponse({ ok: true });
}

async function runCronReport(env: Env): Promise<void> {
  try {
    const ctx: CommandContext = {
      chatId: parseInt(env.TELEGRAM_CHAT_ID, 10),
      userId: 0,
      username: 'cron',
      text: '/status',
      args: [],
      env,
    };

    const reply = await route(env, ctx);

    const now = new Date();
    const header =
      `🕐 <b>Laporan Otomatis</b>\n` +
      `<i>${now.toISOString().replace('T', ' ').slice(0, 16)} UTC</i>\n\n`;

    await sendMessage(env, {
      text: header + reply,
      parseMode: 'HTML',
    });
  } catch (err) {
    console.error('[Cron] report failed:', err);
  }
}

async function handleSetup(env: Env, url: URL): Promise<Response> {
  const action = url.searchParams.get('action');

  if (action === 'set-webhook') {
    const webhookUrl = `${url.origin}/webhook`;
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ['message'],
          drop_pending_updates: true,
        }),
      }
    );
    const data = await res.json();
    return jsonResponse({ ok: true, webhook: webhookUrl, telegram: data });
  }

  if (action === 'delete-webhook') {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`,
      { method: 'POST' }
    );
    const data = await res.json();
    return jsonResponse({ ok: true, telegram: data });
  }

  if (action === 'info') {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`
    );
    const data = await res.json();
    return jsonResponse({ ok: true, telegram: data });
  }

  if (action === 'test-notify') {
    await sendMessage(env, {
      text: '🧪 Test notif dari Bima Akbar[bot]',
    });
    return jsonResponse({ ok: true, sent: true });
  }

  if (action === 'report') {
    await runCronReport(env);
    return jsonResponse({ ok: true, reported: true });
  }

  if (action === 'cleanup') {
    const [logs, limits] = await Promise.all([
      cleanupOldLogs(env, 7),
      cleanupRateLimits(env),
    ]);
    return jsonResponse({ ok: true, logsDeleted: logs, limitsDeleted: limits });
  }

  return jsonResponse({ error: 'unknown action' }, 400);
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '/health') {
      return jsonResponse({
        status: 'ok',
        service: 'bimaakbar',
        commands: getAllCommands().map((c) => c.name),
        timestamp: new Date().toISOString(),
      });
    }

    if (path === '/setup') {
      return handleSetup(env, url);
    }

    if (path === '/webhook' && request.method === 'POST') {
      return handleTelegram(request, env, ctx);
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runCronReport(env));
    ctx.waitUntil(cleanupOldLogs(env, 7).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;