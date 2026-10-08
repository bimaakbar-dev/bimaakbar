import type { Command } from '../types';
import { getAllCommands } from '../lib/router';

export const helpCommand: Command = {
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
    lines.push('<i>Bot ini untuk monitor & manage semua repo.</i>');
    return lines.join('\n');
  },
};