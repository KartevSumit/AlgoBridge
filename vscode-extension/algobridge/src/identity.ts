import { ProblemPayload } from './problemView';

export interface ProblemStat {
  sourceFile: string;
  platform?: string;
  contestId?: string;
  index?: string;
  payload: ProblemPayload;
}

export function buildStat(problem: ProblemPayload, sourceFile: string): ProblemStat {
  return {
    sourceFile,
    platform: problem.platform,
    contestId: problem.contestId,
    index: problem.index,
    payload: problem,
  };
}

export function normalizeIdentity(item?: {
  platform?: string;
  contestId?: string | number;
  index?: string;
}) {
  if (!item) {
    return { platform: undefined, contestId: undefined, index: undefined };
  }
  const platform =
    typeof item.platform === 'string' && item.platform.trim()
      ? item.platform.trim().toLowerCase()
      : undefined;
  const contestId =
    item.contestId !== undefined && item.contestId !== null && String(item.contestId).trim() !== ''
      ? String(item.contestId).trim()
      : undefined;
  const index =
    typeof item.index === 'string' && item.index.trim() !== ''
      ? item.index.trim()
      : undefined;
  return { platform, contestId, index };
}

export function identityEquals(
  a?: { platform?: string; contestId?: string | number; index?: string },
  b?: { platform?: string; contestId?: string | number; index?: string }
): boolean {
  const normA = normalizeIdentity(a);
  const normB = normalizeIdentity(b);

  const aAllUndefined =
    normA.platform === undefined && normA.contestId === undefined && normA.index === undefined;
  const bAllUndefined =
    normB.platform === undefined && normB.contestId === undefined && normB.index === undefined;

  // undefined vs undefined -> true
  if (aAllUndefined && bAllUndefined) {
    return true;
  }

  // C3: all-undefined vs defined -> false (mismatch)
  if (aAllUndefined || bAllUndefined) {
    return false;
  }

  return (
    normA.platform === normB.platform &&
    normA.contestId === normB.contestId &&
    normA.index === normB.index
  );
}
