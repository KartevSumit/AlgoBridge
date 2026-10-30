import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProblemPayload } from './problemView';
import { ProblemStat, buildStat } from './identity';

export function canonicalKey(fsPath: string): string {
  try {
    if (fs.existsSync(fsPath)) {
      return (fs.realpathSync.native || fs.realpathSync)(fsPath);
    }
    const dir = path.dirname(fsPath);
    const base = path.basename(fsPath);
    if (fs.existsSync(dir)) {
      const canonicalDir = (fs.realpathSync.native || fs.realpathSync)(dir);
      return path.join(canonicalDir, base);
    }
    return path.resolve(fsPath);
  } catch {
    return path.resolve(fsPath);
  }
}

export function ensureGitignoreEntry(content: string): string | null {
  const isCrlf = content.includes('\r\n');
  const eol = isCrlf ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#')) {
      continue;
    }
    if (
      line === '.algobridge' ||
      line === '.algobridge/' ||
      line === '/.algobridge' ||
      line === '/.algobridge/'
    ) {
      return null;
    }
  }

  const needsLeadingNewline =
    content.length > 0 && !content.endsWith('\n') && !content.endsWith('\r');
  const prefix = needsLeadingNewline ? eol : '';
  return `${content}${prefix}.algobridge/${eol}`;
}

export class ProblemStore {
  private statMap = new Map<string, ProblemStat>();
  private baseMap = new Map<string, ProblemStat>();
  private storageDir: string | null = null;
  private workspaceFolder: string | null = null;

  constructor(
    private context: vscode.ExtensionContext,
    customStorageDir?: string
  ) {
    if (customStorageDir) {
      this.storageDir = path.join(customStorageDir, '.algobridge');
      this.workspaceFolder = customStorageDir;
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } else {
      this.initStorage();
    }
    this.loadFromWorkspace();
  }

  public initStorage() {
    try {
      const workspaceFolder = this.workspaceFolder || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceFolder) {
        this.workspaceFolder = workspaceFolder;
        this.storageDir = path.join(workspaceFolder, '.algobridge');
        if (!fs.existsSync(this.storageDir)) {
          fs.mkdirSync(this.storageDir, { recursive: true });
        }
        this.offerGitignoreEntry();
      }
    } catch (e) {
      console.warn('initStorage encountered error:', e);
    }
  }

  public hasStatFile(base: string): boolean {
    if (!this.storageDir) return false;
    return fs.existsSync(path.join(this.storageDir, `${base}.stat`));
  }

  async remap(filePath: string, problem: ProblemPayload): Promise<void> {
    return this.attachToFile(filePath, problem);
  }

  private offerGitignoreEntry() {
    try {
      if (!this.workspaceFolder) return;
      const gitignorePath = path.join(this.workspaceFolder, '.gitignore');
      if (!fs.existsSync(gitignorePath)) return;

      const raw = fs.readFileSync(gitignorePath, 'utf8');
      const updated = ensureGitignoreEntry(raw);
      if (!updated) return;

      const flagKey = `algobridge.gitignoreOffered.${this.workspaceFolder}`;
      if (this.context.workspaceState.get<boolean>(flagKey)) return;

      this.context.workspaceState.update(flagKey, true);

      vscode.window
        .showInformationMessage(
          'AlgoBridge storage directory (.algobridge/) is not ignored by git.',
          'Add to .gitignore'
        )
        .then((choice) => {
          if (choice === 'Add to .gitignore') {
            try {
              fs.writeFileSync(gitignorePath, updated, 'utf8');
            } catch (err) {
              console.warn('Failed to update .gitignore', err);
            }
          }
        });
    } catch (e) {
      console.warn('offerGitignoreEntry encountered error:', e);
    }
  }

  public loadFromWorkspace() {
    if (!this.storageDir || !fs.existsSync(this.storageDir)) return;

    try {
      const files = fs.readdirSync(this.storageDir);
      for (const file of files) {
        if (file.endsWith('.stat')) {
          try {
            const filePath = path.join(this.storageDir, file);
            const raw = fs.readFileSync(filePath, 'utf8');
            const data: ProblemStat = JSON.parse(raw);

            if (data.sourceFile && fs.existsSync(data.sourceFile)) {
              const key = canonicalKey(data.sourceFile);
              this.statMap.set(key, data);
              this.baseMap.set(this.baseFromPath(key), data);
            }
          } catch (e) {
            console.warn(`Failed to parse stat file: ${file}`, e);
          }
        }
      }
    } catch (e) {
      console.warn('Error reading storage directory', e);
    }
  }

  async attachToFile(filePath: string, problem: ProblemPayload): Promise<void> {
    const key = canonicalKey(filePath);
    const stat = buildStat(problem, key);
    this.statMap.set(key, stat);
    this.baseMap.set(this.baseFromPath(key), stat);
    this.saveToWorkspace(key, stat);
  }

  private saveToWorkspace(sourceFile: string, stat: ProblemStat) {
    if (!this.storageDir) return;

    const base = this.baseFromPath(sourceFile);
    const statPath = path.join(this.storageDir, `${base}.stat`);
    const tempPath = path.join(
      this.storageDir,
      `${base}.stat.tmp.${Date.now()}.${Math.floor(Math.random() * 100000)}`
    );

    try {
      fs.writeFileSync(tempPath, JSON.stringify(stat, null, 2), 'utf8');
      fs.renameSync(tempPath, statPath);
    } catch (e) {
      console.error(`Failed to save stat file: ${statPath}`, e);
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
    }
  }

  getStat(filePath: string): ProblemStat | undefined {
    const key = canonicalKey(filePath);
    return this.statMap.get(key) || this.baseMap.get(this.baseFromPath(key));
  }

  getForFile(filePath: string): ProblemPayload | undefined {
    return this.getStat(filePath)?.payload;
  }

  getByBaseName(base: string): ProblemPayload | undefined {
    return this.baseMap.get(base)?.payload;
  }

  private baseFromPath(filePath: string): string {
    return path.basename(filePath).replace(/\.\w+$/, '');
  }
}
