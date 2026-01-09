import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProblemPayload } from './problemView';

export class ProblemStore {
  private fileMap = new Map<string, ProblemPayload>();
  private baseMap = new Map<string, ProblemPayload>();
  private pending: ProblemPayload | null = null;
  private storageDir: string | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.initStorage();
    this.loadFromWorkspace();
  }

  private initStorage() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      this.storageDir = path.join(workspaceFolder, '.algobridge');
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    }
  }

  private loadFromWorkspace() {
    if (!this.storageDir || !fs.existsSync(this.storageDir)) return;

    const files = fs.readdirSync(this.storageDir);
    for (const file of files) {
      if (file.endsWith('.stat')) {
        try {
          const filePath = path.join(this.storageDir, file);
          const raw = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(raw);

          // data.sourceFile should be stored in the .stat file to link back
          if (data.sourceFile && fs.existsSync(data.sourceFile)) {
            this.fileMap.set(data.sourceFile, data.payload);
            this.baseMap.set(this.baseFromPath(data.sourceFile), data.payload);
          }
        } catch (e) {
          console.error(`Failed to load stat file: ${file}`, e);
        }
      }
    }
  }

  attachToFile(filePath: string, problem: ProblemPayload) {
    const realPath = fs.realpathSync(filePath);
    this.fileMap.set(realPath, problem);
    this.baseMap.set(this.baseFromPath(realPath), problem);

    this.saveToWorkspace(realPath, problem);
  }

  private saveToWorkspace(sourceFile: string, payload: ProblemPayload) {
    if (!this.storageDir) return;

    const base = this.baseFromPath(sourceFile);
    const statPath = path.join(this.storageDir, `${base}.stat`);

    const data = {
      sourceFile,
      payload,
    };

    fs.writeFileSync(statPath, JSON.stringify(data, null, 2));
  }

  setPending(problem: ProblemPayload) {
    this.pending = problem;
  }

  attachPendingIfAny(editor: vscode.TextEditor): ProblemPayload | null {
    if (!this.pending) return null;
    const filePath = editor.document.uri.fsPath;
    const problem = this.pending;
    this.attachToFile(filePath, problem);
    this.pending = null;
    return problem;
  }

  getForFile(filePath: string): ProblemPayload | undefined {
    try {
      return this.fileMap.get(fs.realpathSync(filePath));
    } catch {
      return this.fileMap.get(filePath);
    }
  }

  getByBaseName(base: string): ProblemPayload | undefined {
    return this.baseMap.get(base);
  }

  private baseFromPath(filePath: string): string {
    return path.basename(filePath).replace(/\.\w+$/, '');
  }
}
