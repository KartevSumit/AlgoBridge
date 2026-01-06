import * as vscode from 'vscode';
import * as path from 'path';

export async function findProblemFile(base: string): Promise<vscode.Uri | null> {
  const patterns = [
    `**/${base}.cpp`,
    `**/${base}.c`,
    `**/${base}.java`,
    `**/${base}.py`,
    `**/${base}.js`,
    `**/${base}.ts`,
  ];

  for (const pattern of patterns) {
    const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
    if (files.length) return files[0];
  }

  return null;
}
