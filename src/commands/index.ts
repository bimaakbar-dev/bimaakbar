import type {
  Command,
  CommandContext,
  Env,
  WorkerInfo,
  WorkerStats,
} from '../types';
import { getAllCommands } from '../lib/router';
import { getRepoInfo, listRepos } from '../lib/github';
import { sendMessage } from '../lib/telegram';

async function fetchWorkerStats(
  id: string,
  url: string
): Promise<WorkerInfo> {
  const info: WorkerInfo = { id, url, ok: false };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    const res = await fetch(`${url}/stats`, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!res.ok) {
      info.error = `HTTP ${res.status}`;
      return info;
    }

    const stats = (await res.json()) as WorkerStats;
    info.ok = true;
    info.stats = stats;
    return info;
  } catch (err) {
    info.error = (err as Error).message ?? 'unknown';
    return info;
  }
}

function parseWorkersWithProtocol(env: Env): { id: string; url: string }[] {
  return env.WORKERS.split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => {
      const idx = w.indexOf(':');
      const afterId = w.slice(idx + 1);
      const id = w.slice(0, idx);
      const url = afterId.startsWith('//')
        ? afterId.slice(2)
        : afterId.startsWith(':')
          ? afterId.slice(1)
          : afterId;
      return { id, url };
    })
    .filter((w) => w.id && w.url);
}

const helpCommand: Command = {
  name: 'help',
  description: 'Daftar command',
  handler: async (): Promise<string> => {
    const cmds = getAllCommands();
    const lines: string[] = [];
    lines.push('🤖 <b>Bima Akbar[bot]</b>');
    lines.push('');
    lines.push('<b>Commands:</b>');
    for (const c of cmds) {
      lines.push(`• <code>/${c.name}</code> — ${c.description}`);
    }
    lines.push('');
    lines.push('<i>Bot ini untuk monitor & manage semua repo Yukio.</i>');
    return lines.join('\n');
  },
};

const reposCommand: Command = {
  name: 'repos',
  description: 'List semua repo yang dimonitor',
  handler: async (ctx: CommandContext): Promise<string> => {
    const repos = await listRepos(ctx.env);
    const lines: string[] = [];
    lines.push(`📚 <b>Repos (${repos.length})</b>`);
    lines.push('');
    for (const r of repos) {
      lines.push(`• <code>${r}</code>`);
    }
    return lines.join('\n');
  },
};

const statusCommand: Command = {
  name: 'status',
  description: 'Status semua repo + worker scraper',
  handler: async (ctx: CommandContext): Promise<string> => {
    const lines: string[] = [];

    lines.push('📊 <b>Workers</b>');
    const workers = parseWorkersWithProtocol(ctx.env);

    if (workers.length === 0) {
      lines.push('  (tidak ada worker terdaftar)');
    } else {
      const results = await Promise.all(
        workers.map((w) => fetchWorkerStats(w.id, w.url))
      );

      let totalFetched = 0;
      let totalPending = 0;
      let totalFailed = 0;
      let totalFailedPerm = 0;

      for (const r of results) {
        if (r.ok && r.stats) {
          lines.push(`  ✅ <b>${r.id}</b>`);
          lines.push(
            `     pending: ${r.stats.pending} · page: ${r.stats.next_page}`
          );
          lines.push(
            `     failed: ${r.stats.failed} · perm: ${r.stats.failed_permanent}`
          );
          totalFetched += r.stats.total_fetched;
          totalPending += r.stats.pending;
          totalFailed += r.stats.failed;
          totalFailedPerm += r.stats.failed_permanent;
        } else {
          lines.push(`  ❌ <b>${r.id}</b> — ${r.error ?? 'unknown'}`);
        }
      }

      lines.push('');
      lines.push('📈 <b>Total</b>');
      lines.push(`  📥 Fetched: <b>${totalFetched}</b>`);
      lines.push(`  📦 Pending: ${totalPending}`);
      lines.push(`  ⚠️ Failed: ${totalFailed}`);
      lines.push(`  ❌ Failed perm: ${totalFailedPerm}`);
    }

    lines.push('');

    lines.push('📁 <b>Repos</b>');
    const repoList = await listRepos(ctx.env);

    const repoInfos = await Promise.all(
      repoList.map((r) => getRepoInfo(ctx.env, r))
    );

    for (let i = 0; i < repoList.length; i++) {
      const repo = repoList[i]!;
      const info = repoInfos[i];

      if (!info) {
        lines.push(`  ❌ <code>${repo}</code> — tidak accessible`);
        continue;
      }

      const commitInfo = info.lastCommit
        ? `${info.lastCommit.sha} · ${info.lastCommit.message.slice(0, 40)}`
        : 'no commit';

      let runStatus = '';
      if (info.lastRun) {
        const emoji =
          info.lastRun.conclusion === 'success'
            ? '✅'
            : info.lastRun.conclusion === 'failure'
              ? '❌'
              : '⏳';
        runStatus = ` · ${emoji} ${info.lastRun.name}`;
      }

      lines.push(`  <code>${repo}</code>`);
      lines.push(`     ${commitInfo}${runStatus}`);
    }

    return lines.join('\n');
  },
};

export const allCommands: Command[] = [
  helpCommand,
  reposCommand,
  statusCommand,
];

export async function sendCommandList(env: Env): Promise<void> {
  const cmds = getAllCommands();
  const lines: string[] = [];
  lines.push('🤖 <b>Bima Akbar[bot]</b>');
  lines.push('');
  for (const c of cmds) {
    lines.push(`• /${c.name} — ${c.description}`);
  }

  await sendMessage(env, {
    text: lines.join('\n'),
    parseMode: 'HTML',
  });
}