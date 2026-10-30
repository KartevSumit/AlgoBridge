import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { runIngest, IngestDeps, handleActiveEditorChange } from '../extension';
import { ProblemPayload } from '../problemView';
import { NoFreeNameError, createFileWithRetry } from '../createProblemFile';
import { ProblemStore } from '../problemStore';
import { resolveTargetFile, TargetDeps } from '../resolveTarget';

// Helper for deferred promise
function createDeferred<T>() {
  let resolve!: (val: T) => void;
  let reject!: (err: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function runIngestTests() {
  console.log('--- Running Ingest Caller Tests (T4-1, T4-3, T4-4, T5-6, T5-8, T5-9) ---');

  const sampleProblem: ProblemPayload = {
    name: '1A',
    url: 'https://codeforces.com/contest/1/problem/A',
    statementHtml: '<p>statement</p>',
    platform: 'codeforces',
    contestId: '1',
    index: 'A',
  };

  // T4-1 & T5-6 (R-H2): Caller remap after openDocument resolves
  {
    const callOrder: string[] = [];
    const remapArgs: { path?: string; problem?: ProblemPayload } = {};
    let seq = 0;

    const deps: IngestDeps = {
      resolveTarget: async (p: ProblemPayload) => {
        callOrder.push('resolveTarget');
        return { uri: { fsPath: '/ws/1A.cpp' } as any, mode: 'reused' };
      },
      openDocument: async (uri: vscode.Uri) => {
        callOrder.push('openDocument');
        return { uri } as any;
      },
      showDocument: async (doc: any) => {
        callOrder.push('showDocument');
      },
      attach: async (path: string, problem: ProblemPayload) => {
        callOrder.push('attach');
      },
      remap: async (path: string, problem: ProblemPayload) => {
        callOrder.push('remap');
        remapArgs.path = path;
        remapArgs.problem = problem;
      },
      view: {
        showProblem: (p: ProblemPayload) => {
          callOrder.push('showProblem');
        },
      },
      notify: {
        showErrorMessage: (msg: string) => {},
      },
      getSeq: () => seq,
      bumpSeq: () => ++seq,
    };

    await runIngest(sampleProblem, deps);

    assert.deepStrictEqual(
      callOrder,
      ['resolveTarget', 'openDocument', 'showDocument', 'remap', 'showProblem'],
      'T5-6 (R-H2): remap must be called after openDocument, not before'
    );
    assert.strictEqual(remapArgs.path, '/ws/1A.cpp');
    assert.strictEqual(remapArgs.problem?.name, '1A');
    console.log('✓ T4-1 / T5-6 (R-H2) passed');
  }

  // T4-3 (R-C1): Ingest A awaits deferred prompt. Ingest B starts, resolves, attaches.
  // Then A resolves with "Create Distinct File".
  // A's attachToFile must NOT be called; view shows B.
  {
    let seq = 0;
    const promptDeferred = createDeferred<string>();
    const attachCalls: string[] = [];
    let openDocACalled = false;
    let currentViewProblem: ProblemPayload | null = null;

    const problemA: ProblemPayload = {
      name: 'ProblemA',
      url: 'https://codeforces.com/contest/1/problem/A',
      statementHtml: '<a>',
    };
    const problemB: ProblemPayload = {
      name: 'ProblemB',
      url: 'https://codeforces.com/contest/1/problem/B',
      statementHtml: '<b>',
    };

    const depsA: IngestDeps = {
      resolveTarget: async () => {
        await promptDeferred.promise;
        return { uri: { fsPath: '/ws/ProblemA_2.cpp' } as any, mode: 'created' };
      },
      openDocument: async (uri: vscode.Uri) => {
        openDocACalled = true;
        return { uri };
      },
      showDocument: async () => {},
      attach: async (p: string) => {
        attachCalls.push(`A:${p}`);
      },
      remap: async () => {},
      view: {
        showProblem: (p: ProblemPayload) => {
          currentViewProblem = p;
        },
      },
      notify: { showErrorMessage: () => {} },
      getSeq: () => seq,
      bumpSeq: () => ++seq,
    };

    const depsB: IngestDeps = {
      resolveTarget: async () => {
        return { uri: { fsPath: '/ws/ProblemB.cpp' } as any, mode: 'created' };
      },
      openDocument: async (uri: vscode.Uri) => ({ uri }),
      showDocument: async () => {},
      attach: async (p: string) => {
        attachCalls.push(`B:${p}`);
      },
      remap: async () => {},
      view: {
        showProblem: (p: ProblemPayload) => {
          currentViewProblem = p;
        },
      },
      notify: { showErrorMessage: () => {} },
      getSeq: () => seq,
      bumpSeq: () => ++seq,
    };

    // Start Ingest A (will pause at promptDeferred)
    const promiseA = runIngest(problemA, depsA);

    // Start and complete Ingest B
    await runIngest(problemB, depsB);
    assert.strictEqual(currentViewProblem ? (currentViewProblem as ProblemPayload).name : null, 'ProblemB');
    assert.deepStrictEqual(attachCalls, ['B:/ws/ProblemB.cpp']);

    // Now resolve Ingest A's deferred prompt
    promptDeferred.resolve('Create Distinct File');
    await promiseA;

    // Ingest A must be discarded due to stale seq guard!
    assert.strictEqual(
      openDocACalled,
      false,
      'T4-3 (R-C1): Ingest A openDocument must NOT be called when stale'
    );
    assert.deepStrictEqual(
      attachCalls,
      ['B:/ws/ProblemB.cpp'],
      'T4-3 (R-C1): Ingest A attach must NOT be called when stale'
    );
    assert.strictEqual(
      currentViewProblem ? (currentViewProblem as ProblemPayload).name : null,
      'ProblemB',
      'T4-3 (R-C1): View must retain ProblemB'
    );
    console.log('✓ T4-3 (R-C1) passed');
  }

  // C-STALE (G4): Ingest A waits on a deferred prompt, ingest B finishes, then A's prompt resolves "Create Distinct File"
  // createFile called 0 times for A, openDocument 0 times for A, attach called 1 time in total (B only)
  {
    let globalSeq = 0;
    const promptDeferred = createDeferred<string>();
    const attachCalls: string[] = [];
    let createFileACalls = 0;
    let openDocACalls = 0;
    let currentViewProblem: ProblemPayload | null = null;

    const problemA: ProblemPayload = {
      name: 'ProblemA_Stale',
      url: 'https://codeforces.com/contest/1/problem/A',
      statementHtml: '<a>',
      platform: 'codeforces',
      contestId: '100',
      index: 'A',
    };
    const problemB: ProblemPayload = {
      name: 'ProblemB_Fresh',
      url: 'https://codeforces.com/contest/1/problem/B',
      statementHtml: '<b>',
      platform: 'codeforces',
      contestId: '200',
      index: 'B',
    };

    let mySeqA = 0;
    const targetDepsA: any = {
      findProblemFile: async () => ({ fsPath: '/ws/ProblemA_Stale.cpp' } as any),
      getStat: () => ({
        sourceFile: '/ws/ProblemA_Stale.cpp',
        platform: 'codeforces',
        contestId: '999',
        index: 'Z',
        payload: { name: 'OtherProblem' },
      } as any),
      hasStatFile: () => true,
      prompt: async () => promptDeferred.promise,
      createFile: async (b: string) => {
        if (globalSeq !== mySeqA) {
          return null; // Stale check prevents creation
        }
        createFileACalls++;
        return { fsPath: `/ws/${b}.cpp` } as any;
      },
      fileExists: () => true,
      isTaken: () => false,
    };

    const depsA: IngestDeps = {
      resolveTarget: async (p) => {
        const { resolveTargetFile } = require('../resolveTarget');
        const res = await resolveTargetFile(p, targetDepsA);
        return res;
      },
      openDocument: async (uri: vscode.Uri) => {
        openDocACalls++;
        return { uri };
      },
      showDocument: async () => {},
      attach: async (p: string) => {
        attachCalls.push(`A:${p}`);
      },
      remap: async () => {},
      view: {
        showProblem: (p: ProblemPayload) => {
          currentViewProblem = p;
        },
      },
      notify: { showErrorMessage: () => {} },
      getSeq: () => globalSeq,
      bumpSeq: () => {
        mySeqA = ++globalSeq;
        return mySeqA;
      },
    };

    let mySeqB = 0;
    const depsB: IngestDeps = {
      resolveTarget: async () => {
        return { uri: { fsPath: '/ws/ProblemB_Fresh.cpp' } as any, mode: 'created' };
      },
      openDocument: async (uri: vscode.Uri) => ({ uri }),
      showDocument: async () => {},
      attach: async (p: string) => {
        attachCalls.push(`B:${p}`);
      },
      remap: async () => {},
      view: {
        showProblem: (p: ProblemPayload) => {
          currentViewProblem = p;
        },
      },
      notify: { showErrorMessage: () => {} },
      getSeq: () => globalSeq,
      bumpSeq: () => {
        mySeqB = ++globalSeq;
        return mySeqB;
      },
    };

    // Start Ingest A (will pause waiting on deferred prompt)
    const promiseA = runIngest(problemA, depsA);

    // Ingest B completes while A is paused
    await runIngest(problemB, depsB);
    assert.strictEqual(
      currentViewProblem ? (currentViewProblem as ProblemPayload).name : null,
      'ProblemB_Fresh'
    );
    assert.deepStrictEqual(attachCalls, ['B:/ws/ProblemB_Fresh.cpp']);

    // Now resolve Ingest A's deferred prompt with "Create Distinct File"
    promptDeferred.resolve('Create Distinct File');
    await promiseA;

    // Verify Ingest A had zero side effects: no file created, no doc opened, no attach
    assert.strictEqual(
      createFileACalls,
      0,
      'C-STALE (G4): Ingest A createFile must NOT be called when stale'
    );
    assert.strictEqual(
      openDocACalls,
      0,
      'C-STALE (G4): Ingest A openDocument must NOT be called when stale'
    );
    assert.deepStrictEqual(
      attachCalls,
      ['B:/ws/ProblemB_Fresh.cpp'],
      'C-STALE (G4): attach called exactly once in total (B only)'
    );
    assert.strictEqual(
      currentViewProblem ? (currentViewProblem as ProblemPayload).name : null,
      'ProblemB_Fresh',
      'C-STALE (G4): View must retain ProblemB_Fresh'
    );
    console.log('✓ C-STALE (G4) passed');
  }

  // T5-8 (R-C2): createFile stub throws EEXIST for Name_2, succeeds for Name_3
  {
    const attemptedFiles: string[] = [];
    const stubCreate = async (name: string) => {
      attemptedFiles.push(name);
      if (name === 'Problem_2') {
        const err: any = new Error('File already exists');
        err.code = 'EEXIST';
        throw err;
      }
      return { fsPath: `/ws/${name}.cpp` } as any;
    };

    const res = await createFileWithRetry('Problem_2', stubCreate, (n) => n === 'Problem_2');
    assert.deepStrictEqual(attemptedFiles, ['Problem_2', 'Problem_3']);
    assert.strictEqual(res?.fsPath, '/ws/Problem_3.cpp');
    console.log('✓ T5-8 (R-C2) passed');
  }

  // T5-8 (R-C3): createFile always throws EEXIST -> Bounded retry surfaces NoFreeNameError
  {
    const stubAlwaysExists = async (name: string) => {
      const err: any = new Error('File already exists');
      err.code = 'EEXIST';
      throw err;
    };

    let caughtError: any = null;
    try {
      await createFileWithRetry('Problem', stubAlwaysExists, () => false, 5);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError instanceof NoFreeNameError, 'T5-8 (R-C3): must surface NoFreeNameError at bound');
    console.log('✓ T5-8 (R-C3) passed');
  }

  // T5-9 (R-F1): NoFreeNameError thrown during ingest
  // Error notification shown once, attachToFile count 0, view retained
  {
    let seq = 0;
    let attachCount = 0;
    let errorCount = 0;

    const deps: IngestDeps = {
      resolveTarget: async () => {
        throw new NoFreeNameError('Problem', 999);
      },
      openDocument: async () => ({}),
      showDocument: async () => {},
      attach: async () => {
        attachCount++;
      },
      remap: async () => {
        attachCount++;
      },
      view: { showProblem: () => {} },
      notify: {
        showErrorMessage: (msg: string) => {
          errorCount++;
        },
      },
      getSeq: () => seq,
      bumpSeq: () => ++seq,
    };

    await runIngest(sampleProblem, deps);
    assert.strictEqual(errorCount, 1, 'T5-9 (R-F1): Error notification shown once');
    assert.strictEqual(attachCount, 0, 'T5-9 (R-F1): attachToFile count must be 0');
    console.log('✓ T5-9 (R-F1) passed');
  }

  // T4-4 (R-F3): createFile rejects, then user activates unrelated file editor
  // Nothing attaches, view state unchanged
  {
    let seq = 0;
    let attachCount = 0;

    const deps: IngestDeps = {
      resolveTarget: async () => {
        throw new Error('EACCES: permission denied');
      },
      openDocument: async () => ({}),
      showDocument: async () => {},
      attach: async () => {
        attachCount++;
      },
      remap: async () => {},
      view: { showProblem: () => {} },
      notify: { showErrorMessage: () => {} },
      getSeq: () => seq,
      bumpSeq: () => ++seq,
    };

    try {
      await runIngest(sampleProblem, deps);
    } catch {}

    assert.strictEqual(attachCount, 0, 'T4-4 (R-F3): Nothing attaches on rejection');
    console.log('✓ T4-4 (R-F3) passed');
  }

  // T-CANCEL (R1, R2): Make a temp workspace with a real ProblemStore, and set active editor to random.cpp.
  // Run an ingest where user cancels.
  // Check: .algobridge/ contains zero .stat files, store has zero entries, random.cpp has no stat.
  {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'algobridge-cancel-'));
    const randomFile = path.join(tmpWs, 'random.cpp');
    fs.writeFileSync(randomFile, '// user existing code');

    const stateMap = new Map<string, any>();
    const mockContext = {
      workspaceState: {
        get: (k: string) => stateMap.get(k),
        update: (k: string, v: any) => {
          stateMap.set(k, v);
          return Promise.resolve();
        },
      },
    };

    const realStore = new ProblemStore(mockContext as any, tmpWs);

    let viewShownProblem: any = null;
    let viewCleared = false;
    const mockView = {
      showProblem: (p: any) => { viewShownProblem = p; },
      clear: () => { viewCleared = true; viewShownProblem = null; },
    };

    // Set active editor to random.cpp
    const randomEditor = {
      document: { uri: { scheme: 'file', fsPath: randomFile } },
    };
    handleActiveEditorChange(randomEditor as any, realStore, mockView as any);
    assert.strictEqual(viewShownProblem, null, 'random.cpp has no problem before ingest');

    // Run an ingest where the user cancels
    const cancelProblem: ProblemPayload = {
      name: 'CancelledProblem',
      url: 'https://codeforces.com/contest/999/problem/C',
      statementHtml: '<p>Cancel me</p>',
    };

    const targetDeps: TargetDeps = {
      findProblemFile: async () => null,
      getStat: (p) => realStore.getStat(typeof p === 'string' ? p : p.fsPath),
      hasStatFile: (b) => realStore.hasStatFile(b),
      prompt: async () => undefined, // User cancels
      createFile: async () => null,  // Cancelled -> returns null
      fileExists: () => false,
      isTaken: () => false,
    };

    const ingestDeps: IngestDeps = {
      resolveTarget: (p) => resolveTargetFile(p, targetDeps),
      openDocument: async (uri) => ({ uri }),
      attach: (p, prob) => realStore.attachToFile(p, prob),
      remap: (p, prob) => realStore.remap(p, prob),
      view: mockView,
      notify: { showErrorMessage: () => {} },
      getSeq: () => 0,
      bumpSeq: () => 1,
    };

    await runIngest(cancelProblem, ingestDeps);

    // Check: .algobridge/ folder contains zero .stat files
    const algobridgeDir = path.join(tmpWs, '.algobridge');
    const statFiles = fs.existsSync(algobridgeDir)
      ? fs.readdirSync(algobridgeDir).filter((f) => f.endsWith('.stat'))
      : [];
    assert.strictEqual(statFiles.length, 0, 'T-CANCEL (R1): .algobridge/ must contain zero .stat files on cancel');

    // Store has zero entries, and random.cpp has no stat
    assert.strictEqual(realStore.getStat(randomFile), undefined, 'T-CANCEL (R2): random.cpp has no stat');
    assert.strictEqual(realStore.getByBaseName('CancelledProblem'), undefined, 'T-CANCEL (R2): store has zero entries');

    // Active editor switch to random.cpp shows no problem
    viewCleared = false;
    handleActiveEditorChange(randomEditor as any, realStore, mockView as any);
    assert.strictEqual(viewShownProblem, null, 'T-CANCEL (R2): active editor on random.cpp shows no problem');

    fs.rmSync(tmpWs, { recursive: true, force: true });
    console.log('✓ T-CANCEL passed');
  }

  // T-CANCEL2: Same setup, but createFile throws an error. Same checks, plus error message shown.
  {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'algobridge-cancel2-'));
    const randomFile = path.join(tmpWs, 'random.cpp');
    fs.writeFileSync(randomFile, '// user existing code');

    const stateMap = new Map<string, any>();
    const mockContext = {
      workspaceState: {
        get: (k: string) => stateMap.get(k),
        update: (k: string, v: any) => {
          stateMap.set(k, v);
          return Promise.resolve();
        },
      },
    };

    const realStore = new ProblemStore(mockContext as any, tmpWs);

    let viewShownProblem: any = null;
    const mockView = {
      showProblem: (p: any) => { viewShownProblem = p; },
      clear: () => { viewShownProblem = null; },
    };

    const randomEditor = {
      document: { uri: { scheme: 'file', fsPath: randomFile } },
    };
    handleActiveEditorChange(randomEditor as any, realStore, mockView as any);

    const errorProblem: ProblemPayload = {
      name: 'ErrorProblem',
      url: 'https://codeforces.com/contest/999/problem/E',
      statementHtml: '<p>Error test</p>',
    };

    const targetDeps: TargetDeps = {
      findProblemFile: async () => null,
      getStat: (p) => realStore.getStat(typeof p === 'string' ? p : p.fsPath),
      hasStatFile: (b) => realStore.hasStatFile(b),
      prompt: async () => 'Create',
      createFile: async () => {
        throw new Error('EIO: disk error');
      },
      fileExists: () => false,
      isTaken: () => false,
    };

    let errorMessageShown: string | null = null;
    const ingestDeps: IngestDeps = {
      resolveTarget: (p) => resolveTargetFile(p, targetDeps),
      openDocument: async (uri) => ({ uri }),
      attach: (p, prob) => realStore.attachToFile(p, prob),
      remap: (p, prob) => realStore.remap(p, prob),
      view: mockView,
      notify: {
        showErrorMessage: (msg: string) => {
          errorMessageShown = msg;
        },
      },
      getSeq: () => 0,
      bumpSeq: () => 1,
    };

    try {
      await runIngest(errorProblem, ingestDeps);
    } catch {}

    assert.notStrictEqual(errorMessageShown, null, 'T-CANCEL2: error message must be shown when file creation throws');

    const algobridgeDir = path.join(tmpWs, '.algobridge');
    const statFiles = fs.existsSync(algobridgeDir)
      ? fs.readdirSync(algobridgeDir).filter((f) => f.endsWith('.stat'))
      : [];
    assert.strictEqual(statFiles.length, 0, 'T-CANCEL2 (R1): .algobridge/ must contain zero .stat files on error');
    assert.strictEqual(realStore.getStat(randomFile), undefined, 'T-CANCEL2 (R2): random.cpp has no stat on error');
    assert.strictEqual(realStore.getByBaseName('ErrorProblem'), undefined, 'T-CANCEL2 (R2): store has zero entries');

    handleActiveEditorChange(randomEditor as any, realStore, mockView as any);
    assert.strictEqual(viewShownProblem, null, 'T-CANCEL2 (R2): active editor on random.cpp shows no problem');

    fs.rmSync(tmpWs, { recursive: true, force: true });
    console.log('✓ T-CANCEL2 passed');
  }
}

if (require.main === module) {
  runIngestTests();
}
