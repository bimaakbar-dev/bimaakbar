export interface Env {
  DB: D1Database;

  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;

  GH_APP_ID: string;
  GH_APP_INSTALLATION_ID: string;
  GH_APP_PRIVATE_KEY: string;

  REPOS: string;
  WORKERS: string;
}

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface CommandContext {
  chatId: number;
  userId: number;
  username: string;
  text: string;
  args: string[];
  env: Env;
}

export interface Command {
  name: string;
  description: string;
  handler: (ctx: CommandContext) => Promise<string>;
}

export interface RepoInfo {
  name: string;
  fullName: string;
  defaultBranch: string;
  pushedAt: string;
  lastCommit?: {
    sha: string;
    message: string;
    author: string;
    date: string;
  };
  lastRun?: {
    name: string;
    status: string;
    conclusion: string | null;
    createdAt: string;
  };
}

export interface WorkerStats {
  total: number;
  pending: number;
  in_progress: number;
  failed: number;
  failed_permanent: number;
  total_fetched: number;
  next_page: number;
}

export interface WorkerInfo {
  id: string;
  url: string;
  ok: boolean;
  stats?: WorkerStats;
  error?: string;
}

export interface CommandLog {
  id: number;
  chat_id: number;
  user_id: number;
  command: string;
  args: string;
  created_at: number;
}