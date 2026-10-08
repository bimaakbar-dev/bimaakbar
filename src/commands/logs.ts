import type { Command, CommandContext } from '../types';
import {
  getRecentCommands,
  getCommandCount,
} from '../lib/state';

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 60) return `${sec}s`;
  if (min < 60) return `${min}m`;
  if (hr < 24) return `${hr}j`;
  return `${day}h`;
}

export const logCommand: Command = {
  name: 'log',
  description: 'Lihat command terakhir',
  handler: async (ctx: CommandContext): Promise<string> => {
    const items = await getRecentCommands(ctx.env, 15);

    if (items.length === 0) {
      return '📭 Belum ada log command.';
    }

    const lines: string[] = [];
    lines.push(`📋 <b>Recent Commands (${items.length})</b>`);
    lines.push('');

    for (const item of items) {
      const emoji = item.ok ? '✅' : '❌';
      const args = item.args ? ` ${item.args.slice(0, 20)}` : '';
      lines.push(
        `${emoji} <code>/${item.command}${args}</code> · ${formatRelative(item.created_at)} · ${item.duration_ms}ms`
      );
    }

    return lines.join('\n');
  },
};

export const statsCommand: Command = {
  name: 'stats',
  description: 'Statistik bot',
  handler: async (ctx: CommandContext): Promise<string> => {
    const [count24h, recent] = await Promise.all([
      getCommandCount(ctx.env, 24),
      getRecentCommands(ctx.env, 100),
    ]);

    const total = recent.length;
    const failed = recent.filter((r) => !r.ok).length;
    const avgMs =
      recent.length > 0
        ? Math.round(
            recent.reduce((sum, r) => sum + r.duration_ms, 0) / recent.length
          )
        : 0;

    const lines: string[] = [];
    lines.push('📊 <b>Bot Statistics</b>');
    lines.push('');
    lines.push(`📥 Command 24 jam: <b>${count24h}</b>`);
    lines.push(`📋 Sample size: ${total}`);
    lines.push(`❌ Failed: ${failed}`);
    lines.push(`⏱️ Avg duration: ${avgMs}ms`);
    lines.push('');
    lines.push(`<i>Uptime: Worker Cloudflare</i>`);

    return lines.join('\n');
  },
};