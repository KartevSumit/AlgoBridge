import * as vscode from 'vscode';
import * as path from 'path';
import { ProblemPayload } from './problemView';

export class ProblemStore {
  private fileMap = new Map<string, ProblemPayload>();
  private baseMap = new Map<string, ProblemPayload>();
  private pending: ProblemPayload | null = null;

  constructor(private context: vscode.ExtensionContext) {
    const saved = context.globalState.get<Record<string, ProblemPayload>>('cfBridge.store') || {};

    for (const [filePath, problem] of Object.entries(saved)) {
      this.fileMap.set(filePath, problem);
      const base = this.baseFromPath(filePath);
      this.baseMap.set(base, problem);
    }
  }

  /* ---------- Attach ---------- */

  attachToFile(filePath: string, problem: ProblemPayload) {
    this.fileMap.set(filePath, problem);

    const base = this.baseFromPath(filePath);
    this.baseMap.set(base, problem);

    this.persist();
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

  /* ---------- Lookup ---------- */

  getForFile(filePath: string): ProblemPayload | undefined {
    return this.fileMap.get(filePath);
  }

  getByBaseName(base: string): ProblemPayload | undefined {
    return this.baseMap.get(base);
  }

  /* ---------- Utils ---------- */

  private baseFromPath(filePath: string): string {
    return path.basename(filePath).replace(/\.\w+$/, '');
  }

  private persist() {
    this.context.globalState.update('cfBridge.store', Object.fromEntries(this.fileMap));
  }
}
