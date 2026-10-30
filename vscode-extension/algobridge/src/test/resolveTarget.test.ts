import * as assert from 'assert';
import { resolveTargetFile, TargetDeps } from '../resolveTarget';
import { ProblemPayload } from '../problemView';

export async function runResolveTargetTests() {
  console.log('--- Running ResolveTarget Orchestration Tests (T5-1, T5-2, T5-4..T5-7) ---');

  const problem: ProblemPayload = {
    name: '1A',
    url: 'https://codeforces.com/contest/1/problem/A',
    statementHtml: '<p>statement</p>',
    platform: 'codeforces',
    contestId: '1',
    index: 'A',
  };

  // T5-1: Target does not exist -> create file
  let createdFile: string | null = null;
  const depsT5_1: TargetDeps = {
    findProblemFile: async () => null,
    getStat: () => undefined,
    prompt: async () => undefined,
    createFile: async (base) => {
      createdFile = base;
      return { fsPath: `/ws/${base}.cpp` } as any;
    },
    fileExists: () => false,
    isTaken: () => false,
  };

  const res1 = await resolveTargetFile(problem, depsT5_1);
  assert.ok(res1 && res1.mode === 'created');
  assert.strictEqual(createdFile, '1A');
  console.log('✓ T5-1 passed');

  // T5-2: Existing stat has identical identity -> reuse, no prompt
  let promptShown = false;
  const depsT5_2: TargetDeps = {
    findProblemFile: async () => ({ fsPath: '/ws/1A.cpp' } as any),
    getStat: () => ({
      sourceFile: '/ws/1A.cpp',
      platform: 'codeforces',
      contestId: '1',
      index: 'A',
      payload: problem,
    }),
    prompt: async () => {
      promptShown = true;
      return undefined;
    },
    createFile: async () => null,
    fileExists: () => true,
    isTaken: () => true,
  };

  const res2 = await resolveTargetFile(problem, depsT5_2);
  assert.ok(res2 && res2.mode === 'reused');
  assert.strictEqual(promptShown, false, 'No prompt shown when identity matches');
  console.log('✓ T5-2 passed');

  // T5-4: Identity differs -> collision prompt with exact text and options
  let promptMessage = '';
  let promptOptions: string[] = [];
  const depsT5_4: TargetDeps = {
    findProblemFile: async () => ({ fsPath: '/ws/1A.cpp' } as any),
    getStat: () => ({
      sourceFile: '/ws/1A.cpp',
      platform: 'codeforces',
      contestId: '2',
      index: 'B',
      payload: { ...problem, name: 'Different Problem', contestId: '2', index: 'B' },
    }),
    prompt: async (msg, opts) => {
      promptMessage = msg;
      promptOptions = opts;
      return 'Cancel';
    },
    createFile: async () => null,
    fileExists: () => true,
    isTaken: () => true,
  };

  await resolveTargetFile(problem, depsT5_4);
  assert.strictEqual(
    promptMessage,
    "File '1A.cpp' belongs to a different problem. Overwrite link or create distinct file?"
  );
  assert.deepStrictEqual(promptOptions, [
    'Reuse Existing File',
    'Create Distinct File',
    'Cancel',
  ]);
  console.log('✓ T5-4 passed');

  // T5-5: Choose "Create Distinct File"
  let createdDistinct = '';
  const depsT5_5: TargetDeps = {
    findProblemFile: async () => ({ fsPath: '/ws/1A.cpp' } as any),
    getStat: () => ({
      sourceFile: '/ws/1A.cpp',
      platform: 'codeforces',
      contestId: '2',
      index: 'B',
      payload: { ...problem, name: 'Different Problem', contestId: '2', index: 'B' },
    }),
    prompt: async () => 'Create Distinct File',
    createFile: async (base) => {
      createdDistinct = base;
      return { fsPath: `/ws/${base}.cpp` } as any;
    },
    fileExists: (name) => name === '1A' || name === '1A_2',
    isTaken: (name) => name === '1A' || name === '1A_2',
  };

  const res5 = await resolveTargetFile(problem, depsT5_5);
  assert.ok(res5 && res5.mode === 'created');
  assert.strictEqual(createdDistinct, '1A_3', 'Must pick 1A_3');
  console.log('✓ T5-5 passed');

  // T5-6: Choose "Reuse Existing File"
  const depsT5_6: TargetDeps = {
    ...depsT5_5,
    prompt: async () => 'Reuse Existing File',
  };
  const res6 = await resolveTargetFile(problem, depsT5_6);
  assert.ok(res6 && res6.mode === 'reused');
  assert.strictEqual(res6.uri.fsPath, '/ws/1A.cpp');
  console.log('✓ T5-6 passed');

  // T5-7: Cancel or dismiss prompt (undefined)
  const depsT5_7: TargetDeps = {
    ...depsT5_5,
    prompt: async () => undefined,
  };
  const res7 = await resolveTargetFile(problem, depsT5_7);
  assert.strictEqual(res7, undefined, 'Must resolve to undefined on cancel');
  console.log('✓ T5-7 passed');

  // R-C4 (R4): Orchestrator run with a spy store injected into deps -> zero store method calls
  let storeMutationCalls = 0;
  const spyStore = {
    attachToFile: () => { storeMutationCalls++; },
    remap: () => { storeMutationCalls++; },
    saveToWorkspace: () => { storeMutationCalls++; },
  };
  // Run across all branches:
  // 1. Create branch
  await resolveTargetFile(problem, { ...depsT5_1, ...(spyStore as any) });
  // 2. Reuse identical branch
  await resolveTargetFile(problem, { ...depsT5_2, ...(spyStore as any) });
  // 3. Collision prompt -> Reuse branch
  await resolveTargetFile(problem, { ...depsT5_6, ...(spyStore as any) });
  // 4. Collision prompt -> Create branch
  await resolveTargetFile(problem, { ...depsT5_5, ...(spyStore as any) });
  // 5. Collision prompt -> Cancel branch
  await resolveTargetFile(problem, { ...depsT5_7, ...(spyStore as any) });

  assert.strictEqual(storeMutationCalls, 0, 'R-C4 (R4): Zero store method calls from inside resolveTargetFile');
  console.log('✓ R-C4 (R4) passed');

  // R-F2 (T5-11): Existing file's .stat is corrupt JSON
  // getStat returns undefined, but hasStatFile is true -> follows C3 and shows collision prompt
  let corruptPromptShown = false;
  const depsCorrupt: TargetDeps = {
    findProblemFile: async () => ({ fsPath: '/ws/1A.cpp' } as any),
    getStat: () => undefined, // corrupt parse returned undefined
    hasStatFile: () => true,  // corrupt .stat file exists on disk
    prompt: async (msg, opts) => {
      corruptPromptShown = true;
      return 'Reuse Existing File';
    },
    createFile: async () => null,
    fileExists: () => true,
    isTaken: () => true,
  };
  const resCorrupt = await resolveTargetFile(problem, depsCorrupt);
  assert.strictEqual(corruptPromptShown, true, 'R-F2 (T5-11): Corrupt stat triggers collision prompt per C3');
  assert.ok(resCorrupt && resCorrupt.mode === 'reused');
  console.log('✓ R-F2 (T5-11) passed');
}

if (require.main === module) {
  runResolveTargetTests();
}
