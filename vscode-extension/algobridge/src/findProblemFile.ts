import * as vscode from 'vscode';

export async function findProblemFile(prefix: string): Promise<vscode.Uri | null> {
  if (!vscode.workspace.workspaceFolders?.length) return null;

  // Only look for source code files
  const pattern = `**/${prefix}.{cpp,cc,cxx,java,py}`;
  const files = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,build,out}/**', 1);

  return files[0] ?? null;
}
