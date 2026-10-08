import type { Command, CommandContext } from '../types';
import { getRepoInfo, listRepos } from '../lib/github';

export const reposCommand: Command = {
  name: 'repos',
  description: 'List semua repo + info terakhir',
  handler: async (ctx: CommandContext): Promise<string> => {
    const repos = await listRepos(ctx.env);

    if (repos.length === 0) {
      return '📭 Tidak ada repo terdaftar.';
    }

    const infos = await Promise.all(
      repos.map((r) => getRepoInfo(ctx.env, r))
    );

    const lines: string[] = [];
    lines.push(`📚 <b>Repos (${repos.length})</b>`);
    lines.push('');

    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i]!;
      const info = infos[i];

      if (!info) {
        lines.push(`❌ <code>${repo}</code> — tidak accessible`);
        lines.push('');
        continue;
      }

      lines.push(`📁 <code>${repo}</code>`);

      if (info.lastCommit) {
        const msg = info.lastCommit.message.slice(0, 50);
        lines.push(`   📝 ${info.lastCommit.sha} · ${msg}`);
        lines.push(
          `   👤 ${info.lastCommit.author} · ${formatRelative(info.lastCommit.date)}`
        );
      } else {
        lines.push('   📝 no commit');
      }

      if (info.lastRun) {
        const emoji =
          info.lastRun.conclusion === 'success'
            ? '✅'
            : info.lastRun.conclusion === 'failure'
              ? '❌'
              : info.lastRun.status === 'in_progress'
                ? '⏳'
                : '⚪';
        lines.push(
          `   ${emoji} ${info.lastRun.name} · ${formatRelative(info.lastRun.createdAt)}`
        );
      }

      lines.push('');
    }

    return lines.join('\n').trim();
  },
};

function formatRelative(iso: string): string {
  if (!iso) return 'unknown';

  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'unknown';

  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 60) return `${sec}s lalu`;
  if (min < 60) return `${min}m lalu`;
  if (hr < 24) return `${hr}j lalu`;
  return `${day}h lalu`;
}