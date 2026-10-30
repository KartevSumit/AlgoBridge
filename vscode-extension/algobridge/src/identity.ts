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

export function parseProblemUrl(url?: string): { platform?: string; contestId?: string; index?: string } {
  if (!url || typeof url !== 'string') {
    return { platform: undefined, contestId: undefined, index: undefined };
  }
  try {
    const contestMatch = url.match(/codeforces\.com\/(?:contest|gym)\/([^/]+)\/problem\/([^/?#]+)/i);
    if (contestMatch) {
      return {
        platform: 'codeforces',
        contestId: contestMatch[1],
        index: contestMatch[2],
      };
    }
    const problemsetMatch = url.match(/codeforces\.com\/problemset\/problem\/([^/]+)\/([^/?#]+)/i);
    if (problemsetMatch) {
      return {
        platform: 'codeforces',
        contestId: problemsetMatch[1],
        index: problemsetMatch[2],
      };
    }
  } catch {
    // ignore
  }
  return { platform: undefined, contestId: undefined, index: undefined };
}

export function enrichProblemIdentity(problem: ProblemPayload): ProblemPayload {
  const fromUrl = parseProblemUrl(problem.url);
  return {
    ...problem,
    platform: problem.platform || fromUrl.platform,
    contestId: problem.contestId || fromUrl.contestId,
    index: problem.index || fromUrl.index,
  };
}
