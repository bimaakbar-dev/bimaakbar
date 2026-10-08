import type { Command, CommandContext, Env } from '../types';

const COMMANDS: Map<string, Command> = new Map();

export function register(cmd: Command): void {
  COMMANDS.set(cmd.name, cmd);
}

export function registerAll(cmds: Command[]): void {
  for (const cmd of cmds) register(cmd);
}

export function getCommand(name: string): Command | undefined {
  return COMMANDS.get(name);
}

export function getAllCommands(): Command[] {
  return [...COMMANDS.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function parseCommand(text: string): {
  name: string;
  args: string[];
} | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const name = parts[0]?.toLowerCase();
  if (!name) return null;

  const cleanName = name.split('@')[0] ?? name;

  return {
    name: cleanName,
    args: parts.slice(1),
  };
}

async function checkRateLimit(
  env: Env,
  userId: number
): Promise<boolean> {
  const now = Date.now();
  const WINDOW_MS = 60 * 1000;
  const MAX_PER_MINUTE = 10;

  try {
    const row = await env.DB
      .prepare(
        'SELECT count, window_start FROM rate_limit WHERE user_id = ?'
      )
      .bind(userId)
      .first<{ count: number; window_start: number }>();

    if (!row) {
      await env.DB
        .prepare(
          `INSERT INTO rate_limit (user_id, count, window_start)
           VALUES (?, 1, ?)`
        )
        .bind(userId, now)
        .run();
      return true;
    }

    if (now - row.window_start > WINDOW_MS) {
      await env.DB
        .prepare(
          `UPDATE rate_limit SET count = 1, window_start = ?
           WHERE user_id = ?`
        )
        .bind(now, userId)
        .run();
      return true;
    }

    if (row.count >= MAX_PER_MINUTE) {
      return false;
    }

    await env.DB
      .prepare(
        `UPDATE rate_limit SET count = count + 1 WHERE user_id = ?`
      )
      .bind(userId)
      .run();

    return true;
  } catch (err) {
    console.error('[Router] rate limit check failed:', err);
    return true;
  }
}

async function logCommand(
  env: Env,
  ctx: {
    chatId: number;
    userId: number;
    command: string;
    args: string;
    ok: boolean;
    durationMs: number;
  }
): Promise<void> {
  try {
    await env.DB
      .prepare(
        `INSERT INTO command_log
         (chat_id, user_id, command, args, ok, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ctx.chatId,
        ctx.userId,
        ctx.command,
        ctx.args,
        ctx.ok ? 1 : 0,
        ctx.durationMs,
        Date.now()
      )
      .run();
  } catch (err) {
    console.error('[Router] log failed:', err);
  }
}

export async function route(
  env: Env,
  ctx: CommandContext
): Promise<string> {
  const parsed = parseCommand(ctx.text);
  if (!parsed) {
    return '🤔 Bukan command. Ketik /help untuk daftar command.';
  }

  const cmd = getCommand(parsed.name);
  if (!cmd) {
    return `❓ Command <code>/${parsed.name}</code> tidak dikenal.\n\nKetik /help untuk daftar.`;
  }

  if (ctx.userId !== 0) {
    const allowed = await checkRateLimit(env, ctx.userId);
    if (!allowed) {
      return '⏱️ Terlalu banyak command. Tunggu 1 menit lagi.';
    }
  }

  const t0 = Date.now();

  try {
    const result = await cmd.handler({
      ...ctx,
      args: parsed.args,
    });

    await logCommand(env, {
      chatId: ctx.chatId,
      userId: ctx.userId,
      command: parsed.name,
      args: parsed.args.join(' '),
      ok: true,
      durationMs: Date.now() - t0,
    });

    return result;
  } catch (err) {
    console.error(`[Router] command ${parsed.name} error:`, err);
    const msg = (err as Error).message ?? 'unknown';

    await logCommand(env, {
      chatId: ctx.chatId,
      userId: ctx.userId,
      command: parsed.name,
      args: parsed.args.join(' '),
      ok: false,
      durationMs: Date.now() - t0,
    });

    return `❌ Error menjalankan <code>/${parsed.name}</code>:\n<code>${msg.slice(0, 200)}</code>`;
  }
}