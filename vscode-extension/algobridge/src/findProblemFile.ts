import * as vscode from 'vscode';

export async function findProblemFile(prefix: string): Promise<vscode.Uri | null> {
  if (!vscode.workspace.workspaceFolders?.length) return null;

  const pattern = `**/${prefix}.*`;

  const files = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,build,out}/**', 1);

  return files[0] ?? null;
}
