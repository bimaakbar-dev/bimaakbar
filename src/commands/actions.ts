import type {
  Command,
  CommandContext,
  Env,
  WorkerStats,
} from '../types';
import { listRepos, triggerWorkflow } from '../lib/github';
import { parseWorkers } from './status';

async function fetchWorker(
  url: string,
  path: string,
  method = 'GET'
): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    const res = await fetch(`${url}${path}`, {
      method,
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: (err as Error).message ?? 'unknown',
    };
  }
}

function findWorker(
  env: Env,
  id: string
): { id: string; url: string } | null {
  const workers = parseWorkers(env);
  return workers.find((w) => w.id === id) ?? null;
}

export const runCommand: Command = {
  name: 'run',
  description: 'Trigger scrape di worker. Format: /run w1',
  handler: async (ctx: CommandContext): Promise<string> => {
    const id = ctx.args[0];

    if (!id) {
      const list = parseWorkers(ctx.env).map((w) => w.id).join(', ');
      return `Usage: <code>/run [${list}]</code>`;
    }

    const worker = findWorker(ctx.env, id);
    if (!worker) {
      return `❌ Worker <code>${id}</code> tidak ditemukan.`;
    }

    const result = await fetchWorker(worker.url, '/run');

    if (!result.ok) {
      return `❌ Worker <b>${id}</b> gagal (HTTP ${result.status}):\n<code>${result.body.slice(0, 300)}</code>`;
    }

    try {
      const data = JSON.parse(result.body) as {
        ok: boolean;
        result?: {
          succeeded: number;
          failed: number;
          refilled: number;
        };
      };

      if (!data.ok) {
        return `⚠️ Worker <b>${id}</b> balas ok=false.`;
      }

      const r = data.result;
      if (!r) {
        return `✅ Worker <b>${id}</b> dipicu.`;
      }

      return (
        `✅ <b>${id}</b> selesai\n` +
        `   Succeeded: ${r.succeeded}\n` +
        `   Failed: ${r.failed}\n` +
        `   Refilled: ${r.refilled}`
      );
    } catch {
      return `✅ Worker <b>${id}</b> dipicu (response tidak valid JSON).`;
    }
  },
};

export const deployCommand: Command = {
  name: 'deploy',
  description: 'Trigger workflow deploy. Format: /deploy yukionime',
  handler: async (ctx: CommandContext): Promise<string> => {
    const target = ctx.args[0];

    const repos = await listRepos(ctx.env);
    const shortMap: Record<string, string> = {};
    for (const r of repos) {
      const parts = r.split('/');
      const short = parts[1] ?? r;
      shortMap[short] = r;
    }

    if (!target) {
      const list = Object.keys(shortMap).join(', ');
      return `Usage: <code>/deploy [${list}]</code>`;
    }

    const repoFull = shortMap[target] ?? target;

    const workflows: Record<string, string> = {
      'bimaakbar-dev/yukionime': 'deploy-frontend.yml',
      'bimaakbar-dev/yukio-api': 'deploy.yml',
      'bimaakbar-dev/yukio-data': 'notify-frontend.yml',
      'orchixs/yukio-api': 'deploy.yml',
      'bimaakbar-dev/yukio-bot': 'deploy.yml',
    };

    const wf = workflows[repoFull];
    if (!wf) {
      return `❌ Tidak ada workflow deploy untuk <code>${repoFull}</code>.`;
    }

    const result = await triggerWorkflow(ctx.env, repoFull, wf);

    if (!result.ok) {
      return `❌ Gagal trigger deploy:\n<code>${result.error}</code>`;
    }

    return `✅ <b>Deploy dipicu</b>\n   Repo: <code>${repoFull}</code>\n   Workflow: <code>${wf}</code>`;
  },
};

export const errorsCommand: Command = {
  name: 'errors',
  description: 'Lihat failed items. Format: /errors w1',
  handler: async (ctx: CommandContext): Promise<string> => {
    const id = ctx.args[0];

    if (!id) {
      const list = parseWorkers(ctx.env).map((w) => w.id).join(', ');
      return `Usage: <code>/errors [${list}]</code>`;
    }

    const worker = findWorker(ctx.env, id);
    if (!worker) {
      return `❌ Worker <code>${id}</code> tidak ditemukan.`;
    }

    const result = await fetchWorker(worker.url, '/errors?limit=10');

    if (!result.ok) {
      return `❌ Gagal ambil errors (HTTP ${result.status}).`;
    }

    try {
      const data = JSON.parse(result.body) as {
        total: number;
        items: {
          slug: string;
          attempt_count: number;
          last_error: string | null;
        }[];
      };

      if (data.total === 0) {
        return `✅ <b>${id}</b> tidak ada failed.`;
      }

      const lines: string[] = [];
      lines.push(`⚠️ <b>${id} Failed (${data.total})</b>`);
      lines.push('');

      for (const item of data.items) {
        const err = (item.last_error ?? 'unknown').slice(0, 60);
        lines.push(`<code>${item.slug}</code> (${item.attempt_count}×)`);
        lines.push(`   ${err}`);
      }

      return lines.join('\n');
    } catch {
      return `⚠️ Response tidak valid: ${result.body.slice(0, 200)}`;
    }
  },
};

export const cleanCommand: Command = {
  name: 'clean',
  description: 'Reset failed permanent. Format: /clean w1',
  handler: async (ctx: CommandContext): Promise<string> => {
    const id = ctx.args[0];

    if (!id) {
      const list = parseWorkers(ctx.env).map((w) => w.id).join(', ');
      return `Usage: <code>/clean [${list}]</code>`;
    }

    const worker = findWorker(ctx.env, id);
    if (!worker) {
      return `❌ Worker <code>${id}</code> tidak ditemukan.`;
    }

    const result = await fetchWorker(worker.url, '/reset-failed', 'GET');

    if (!result.ok) {
      return `❌ Gagal reset (HTTP ${result.status}).`;
    }

    try {
      const data = JSON.parse(result.body) as { ok: boolean; reset: number };
      return `✅ <b>${id}</b> reset <b>${data.reset}</b> item.`;
    } catch {
      return `⚠️ Response tidak valid.`;
    }
  },
};

export const workersCommand: Command = {
  name: 'workers',
  description: 'Ringkas stats 2 worker',
  handler: async (ctx: CommandContext): Promise<string> => {
    const workers = parseWorkers(ctx.env);

    if (workers.length === 0) {
      return '📭 Tidak ada worker terdaftar.';
    }

    const lines: string[] = [];
    lines.push('📊 <b>Worker Stats</b>');
    lines.push('');

    for (const w of workers) {
      const result = await fetchWorker(w.url, '/stats');

      if (!result.ok) {
        lines.push(`❌ <b>${w.id}</b> — HTTP ${result.status}`);
        continue;
      }

      try {
        const s = JSON.parse(result.body) as WorkerStats;
        lines.push(`✅ <b>${w.id}</b>`);
        lines.push(`   📥 Fetched: ${s.total_fetched}`);
        lines.push(`   📦 Pending: ${s.pending}`);
        lines.push(`   ⚠️ Failed: ${s.failed}`);
        lines.push(`   ❌ Perm: ${s.failed_permanent}`);
        lines.push(`   📄 Page: ${s.next_page}`);
        lines.push('');
      } catch {
        lines.push(`⚠️ <b>${w.id}</b> — response invalid`);
      }
    }

    return lines.join('\n').trim();
  },
};