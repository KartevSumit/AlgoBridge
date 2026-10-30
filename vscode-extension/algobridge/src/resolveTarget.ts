import * as vscode from 'vscode';
import { ProblemPayload } from './problemView';
import { ProblemStat, identityEquals } from './identity';
import { problemNameToFilePrefix } from './problemNameToBase';
import { nextAvailableName } from './createProblemFile';

export interface TargetDeps {
  findProblemFile: (base: string) => Promise<vscode.Uri | null>;
  getStat: (uriOrPath: vscode.Uri | string) => ProblemStat | undefined;
  hasStatFile?: (base: string) => boolean;
  prompt: (message: string, options: string[]) => Promise<string | undefined>;
  createFile: (base: string) => Promise<vscode.Uri | null>;
  fileExists: (base: string) => boolean;
  isTaken: (base: string) => boolean;
}

export async function resolveTargetFile(
  problem: ProblemPayload,
  deps: TargetDeps
): Promise<{ uri: vscode.Uri; mode: 'created' | 'reused' } | undefined> {
  const base = problemNameToFilePrefix(problem.name);
  const existing = await deps.findProblemFile(base);

  if (!existing) {
    const uri = await deps.createFile(base);
    return uri ? { uri, mode: 'created' } : undefined;
  }

  const stat = deps.getStat(existing.fsPath ?? existing);

  // C4: No stat -> unlinked user file, reuse unless a corrupt .stat file exists on disk (C3 / R5)
  if (!stat) {
    if (deps.hasStatFile && deps.hasStatFile(base)) {
      // Corrupt .stat file on disk treated as unknown identity (C3) -> prompt
    } else {
      return { uri: existing, mode: 'reused' };
    }
  } else if (identityEquals(stat, problem)) {
    // Identity matches -> same problem re-imported, reuse
    return { uri: existing, mode: 'reused' };
  }

  // Identity differs or unknown -> prompt
  const message = `File '${base}.cpp' belongs to a different problem. Overwrite link or create distinct file?`;
  const options = ['Reuse Existing File', 'Create Distinct File', 'Cancel'];
  const choice = await deps.prompt(message, options);

  if (choice === 'Reuse Existing File') {
    return { uri: existing, mode: 'reused' };
  }

  if (choice === 'Create Distinct File') {
    const newName = nextAvailableName(base, (n) => deps.isTaken(n));
    const uri = await deps.createFile(newName);
    return uri ? { uri, mode: 'created' } : undefined;
  }

  return undefined;
}
