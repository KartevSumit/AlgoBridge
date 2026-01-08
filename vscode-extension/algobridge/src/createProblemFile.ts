import * as vscode from 'vscode';
import * as path from 'path';

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

  const template = ext === 'cpp'
    ? `#include <bits/stdc++.h>\nusing namespace std;\n\nint main(){\n    \n}\n`
    : '';

  await vscode.workspace.fs.writeFile(uri, Buffer.from(template));
  await vscode.window.showTextDocument(uri);

  return uri;
}
