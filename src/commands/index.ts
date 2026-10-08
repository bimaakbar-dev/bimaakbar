import type { Command, Env } from '../types';
import { getAllCommands } from '../lib/router';
import { sendMessage } from '../lib/telegram';

import { helpCommand } from './help';
import { reposCommand } from './repos';
import { statusCommand } from './status';
import {
  runCommand,
  deployCommand,
  errorsCommand,
  cleanCommand,
  workersCommand,
} from './actions';
import { logCommand, statsCommand } from './logs';

export const allCommands: Command[] = [
  helpCommand,
  reposCommand,
  statusCommand,
  workersCommand,
  runCommand,
  deployCommand,
  errorsCommand,
  cleanCommand,
  logCommand,
  statsCommand,
];

export async function sendCommandList(env: Env): Promise<void> {
  const cmds = getAllCommands();
  const lines: string[] = [];
  lines.push('🤖 <b>Bima Akbar[bot]</b>');
  lines.push('');
  lines.push('<b>Commands:</b>');
  for (const c of cmds) {
    lines.push(`• /${c.name} — ${c.description}`);
  }

  await sendMessage(env, {
    text: lines.join('\n'),
    parseMode: 'HTML',
  });
}