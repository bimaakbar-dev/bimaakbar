import type { Env, RepoInfo } from '../types';
import { getInstallationToken } from './github-app';

const API_BASE = 'https://api.github.com';

async function headers(env: Env): Promise<Record<string, string>> {
  const token = await getInstallationToken(env);
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'yukio-admin/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

interface RepoApiResponse {
  full_name: string;
  name: string;
  default_branch: string;
  pushed_at: string;
}

interface CommitApiResponse {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
}

interface WorkflowRunApiResponse {
  workflow_runs: {
    name: string;
    status: string;
    conclusion: string | null;
    created_at: string;
  }[];
}

export async function getRepoInfo(
  env: Env,
  repoFullName: string
): Promise<RepoInfo | null> {
  const h = await headers(env);

  const repoRes = await fetch(`${API_BASE}/repos/${repoFullName}`, {
    headers: h,
  });
  if (!repoRes.ok) return null;

  const repo = (await repoRes.json()) as RepoApiResponse;

  const info: RepoInfo = {
    name: repo.name,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    pushedAt: repo.pushed_at,
  };

  const commitRes = await fetch(
    `${API_BASE}/repos/${repoFullName}/commits?per_page=1`,
    { headers: h }
  );
  if (commitRes.ok) {
    const commits = (await commitRes.json()) as CommitApiResponse[];
    const c = commits[0];
    if (c) {
      info.lastCommit = {
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0] ?? '',
        author: c.commit.author?.name ?? 'unknown',
        date: c.commit.author?.date ?? '',
      };
    }
  }

  const runsRes = await fetch(
    `${API_BASE}/repos/${repoFullName}/actions/runs?per_page=1`,
    { headers: h }
  );
  if (runsRes.ok) {
    const runs = (await runsRes.json()) as WorkflowRunApiResponse;
    const r = runs.workflow_runs[0];
    if (r) {
      info.lastRun = {
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        createdAt: r.created_at,
      };
    }
  }

  return info;
}

export async function listRepos(env: Env): Promise<string[]> {
  return env.REPOS.split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

export async function triggerWorkflow(
  env: Env,
  repoFullName: string,
  workflowFile: string,
  ref = 'main'
): Promise<{ ok: boolean; error?: string }> {
  const url = `${API_BASE}/repos/${repoFullName}/actions/workflows/${workflowFile}/dispatches`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(await headers(env)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
  }

  return { ok: true };
}

export async function getFile(
  env: Env,
  repoFullName: string,
  path: string
): Promise<{ content: string; sha: string } | null> {
  const url = `${API_BASE}/repos/${repoFullName}/contents/${path}`;
  const res = await fetch(url, { headers: await headers(env) });

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = (await res.json()) as { content: string; sha: string };
  const bin = atob(data.content.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const content = new TextDecoder('utf-8').decode(bytes);

  return { content, sha: data.sha };
}