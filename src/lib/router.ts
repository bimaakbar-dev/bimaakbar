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
  return [...COMMANDS.values()];
}

export async function logCommand(
  env: Env,
  ctx: {
    chatId: number;
    userId: number;
    command: string;
    args: string;
  }
): Promise<void> {
  try {
    await env.DB
      .prepare(
        `INSERT INTO command_log (chat_id, user_id, command, args, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        ctx.chatId,
        ctx.userId,
        ctx.command,
        ctx.args,
        Date.now()
      )
      .run();
  } catch (err) {
    console.error('[Router] log failed:', err);
  }
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

  // Telegram kadang kirim /command@botname — strip @botname
  const cleanName = name.split('@')[0] ?? name;

  return {
    name: cleanName,
    args: parts.slice(1),
  };
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

  await logCommand(env, {
    chatId: ctx.chatId,
    userId: ctx.userId,
    command: parsed.name,
    args: parsed.args.join(' '),
  });

  try {
    const result = await cmd.handler({
      ...ctx,
      args: parsed.args,
    });
    return result;
  } catch (err) {
    console.error(`[Router] command ${parsed.name} error:`, err);
    const msg = (err as Error).message ?? 'unknown';
    return `❌ Error menjalankan <code>/${parsed.name}</code>:\n<code>${msg.slice(0, 200)}</code>`;
  }
}