import type { Env } from '../types';

export async function getRecentCommands(
  env: Env,
  limit = 20
): Promise<
  {
    command: string;
    args: string;
    ok: boolean;
    duration_ms: number;
    created_at: number;
  }[]
> {
  try {
    const res = await env.DB
      .prepare(
        `SELECT command, args, ok, duration_ms, created_at
         FROM command_log
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<{
        command: string;
        args: string;
        ok: number;
        duration_ms: number;
        created_at: number;
      }>();

    return (res.results ?? []).map((r) => ({
      command: r.command,
      args: r.args,
      ok: r.ok === 1,
      duration_ms: r.duration_ms,
      created_at: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getCommandCount(
  env: Env,
  hours = 24
): Promise<number> {
  const since = Date.now() - hours * 60 * 60 * 1000;

  try {
    const row = await env.DB
      .prepare(
        'SELECT COUNT(*) as c FROM command_log WHERE created_at > ?'
      )
      .bind(since)
      .first<{ c: number }>();

    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

export async function cleanupOldLogs(
  env: Env,
  daysToKeep = 7
): Promise<number> {
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

  try {
    const res = await env.DB
      .prepare('DELETE FROM command_log WHERE created_at < ?')
      .bind(cutoff)
      .run();

    return res.meta?.changes ?? 0;
  } catch {
    return 0;
  }
}

export async function cleanupRateLimits(env: Env): Promise<number> {
  const cutoff = Date.now() - 5 * 60 * 1000;

  try {
    const res = await env.DB
      .prepare('DELETE FROM rate_limit WHERE window_start < ?')
      .bind(cutoff)
      .run();

    return res.meta?.changes ?? 0;
  } catch {
    return 0;
  }
}