import type {
  Command,
  CommandContext,
  Env,
  WorkerInfo,
  WorkerStats,
} from '../types';
import { getRepoInfo, listRepos } from '../lib/github';

async function fetchWorkerStats(
  env: Env,
  id: string,
  url: string
): Promise<WorkerInfo> {
  const info: WorkerInfo = { id, url, ok: false };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    let res: Response;

    if (id === 'w1') {
      res = await env.WORKER_1.fetch(`${url}/stats`, {
        signal: ctrl.signal,
      } as RequestInit);
    } else {
      res = await fetch(`${url}/stats`, { signal: ctrl.signal });
    }

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

export function parseWorkers(
  env: Env
): { id: string; url: string }[] {
  return env.WORKERS.split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => {
      const idx = w.indexOf(':');
      if (idx === -1) return { id: w, url: '' };
      const id = w.slice(0, idx);
      const rest = w.slice(idx + 1);
      const url = rest.startsWith('//')
        ? rest.slice(2)
        : rest.startsWith(':')
          ? rest.slice(1)
          : rest;
      return { id, url };
    })
    .filter((w) => w.id && w.url);
}

function formatRelative(iso: string): string {
  if (!iso) return 'unknown';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'unknown';

  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 60) return `${sec}s`;
  if (min < 60) return `${min}m`;
  if (hr < 24) return `${hr}j`;
  return `${day}h`;
}

export const statusCommand: Command = {
  name: 'status',
  description: 'Status worker + repo',
  handler: async (ctx: CommandContext): Promise<string> => {
    const lines: string[] = [];

    lines.push('📊 <b>Workers</b>');
    const workers = parseWorkers(ctx.env);

    if (workers.length === 0) {
      lines.push('  (tidak ada worker terdaftar)');
    } else {
      const results = await Promise.all(
        workers.map((w) => fetchWorkerStats(ctx.env, w.id, w.url))
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
        lines.push(`  ❌ <code>${repo}</code>`);
        continue;
      }

      const commitInfo = info.lastCommit
        ? `${info.lastCommit.sha} · ${info.lastCommit.message.slice(0, 35)}`
        : 'no commit';

      let runStatus = '';
      if (info.lastRun) {
        const emoji =
          info.lastRun.conclusion === 'success'
            ? '✅'
            : info.lastRun.conclusion === 'failure'
              ? '❌'
              : '⏳';
        runStatus = ` · ${emoji} ${formatRelative(info.lastRun.createdAt)}`;
      }

      lines.push(`  <code>${repo}</code>`);
      lines.push(`     ${commitInfo}${runStatus}`);
    }

    return lines.join('\n');
  },
};