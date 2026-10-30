import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class NoFreeNameError extends Error {
  constructor(base: string, max: number) {
    super(`No free filename available for "${base}" within limit of _${max}.`);
    this.name = 'NoFreeNameError';
  }
}

export function nextAvailableName(
  base: string,
  isTaken: (name: string) => boolean,
  max = 999
): string {
  for (let i = 2; i <= max; i++) {
    const candidate = `${base}_${i}`;
    if (!isTaken(candidate)) {
      return candidate;
    }
  }
  throw new NoFreeNameError(base, max);
}

export async function createProblemFile(
  base: string,
  language = 'cpp'
): Promise<vscode.Uri | null> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return null;

  const extMap: Record<string, string> = {
    cpp: 'cpp',
    java: 'java',
    py: 'py',
  };

  const ext = extMap[language] ?? 'cpp';
  const filePath = path.join(folder.uri.fsPath, `${base}.${ext}`);
  const uri = vscode.Uri.file(filePath);

  const template =
    ext === 'cpp'
      ? `#include <bits/stdc++.h>\nusing namespace std;\n\nint main(){\n    \n}\n`
      : '';

  // Exclusive create: 'wx' flag fails with EEXIST if file already exists
  await fs.promises.writeFile(filePath, template, { flag: 'wx' });

  return uri;
}

export async function createFileWithRetry(
  base: string,
  createFn: (name: string) => Promise<vscode.Uri | null>,
  isTaken: (name: string) => boolean,
  max = 10
): Promise<vscode.Uri | null> {
  let candidate = base;
  const rootBase = base.replace(/_\d+$/, '');
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await createFn(candidate);
    } catch (err: any) {
      if (err && err.code === 'EEXIST') {
        candidate = nextAvailableName(rootBase, isTaken);
        continue;
      }
      throw err;
    }
  }
  throw new NoFreeNameError(base, max);
}
