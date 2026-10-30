import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ensureGitignoreEntry, ProblemStore } from '../problemStore';

export async function runGitignoreTests() {
  console.log('--- Running Gitignore Tests (T6-5 .. T6-10) ---');

  // T6-5: Happy path
  assert.strictEqual(
    ensureGitignoreEntry('node_modules\n'),
    'node_modules\n.algobridge/\n',
    'T6-5: appends .algobridge/\n'
  );

  // T6-6: Already present in variants
  const variants = [
    '.algobridge',
    '.algobridge/',
    '/.algobridge',
    '/.algobridge/',
    '  .algobridge/  ',
    'node_modules\r\n.algobridge/\r\n',
  ];
  for (const v of variants) {
    assert.strictEqual(
      ensureGitignoreEntry(v),
      null,
      `T6-6: variant "${v}" must return null`
    );
  }
  console.log('✓ T6-6 passed');

  // T6-7: Commented-out entry is ignored
  assert.strictEqual(
    ensureGitignoreEntry('# .algobridge/\n'),
    '# .algobridge/\n.algobridge/\n',
    'T6-7: commented entry should not block adding .algobridge/'
  );
  console.log('✓ T6-7 passed');

  // T6-8: No trailing newline / CRLF support
  assert.strictEqual(
    ensureGitignoreEntry('node_modules'),
    'node_modules\n.algobridge/\n',
    'T6-8: adds newline separator if file lacks trailing newline'
  );
  assert.strictEqual(
    ensureGitignoreEntry('node_modules\r\ndist'),
    'node_modules\r\ndist\r\n.algobridge/\r\n',
    'T6-8: CRLF file uses CRLF for appended entry'
  );
  console.log('✓ T6-8 passed');

  // R-H3 (T6-10): First initStorage() shows notification, sets flag, clicking "Add" writes entry
  // Second call asserts no second notification (M4)
  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'algobridge-gitignore-'));
  const gitignoreFile = path.join(tmpWs, '.gitignore');
  fs.writeFileSync(gitignoreFile, 'node_modules\n', 'utf8');

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

  let notifyCount = 0;
  let promptChoice = 'Add to .gitignore';
  const vscodeModule = require('vscode');
  const originalShowInfo = vscodeModule.window.showInformationMessage;

  vscodeModule.window.showInformationMessage = async (msg: string, ...items: string[]) => {
    notifyCount++;
    return promptChoice;
  };

  try {
    const store = new ProblemStore(mockContext as any, tmpWs);
    // First call to initStorage
    store.initStorage();
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(notifyCount, 1, 'R-H3 (T6-10): Exactly one notification shown on first call');
    const flagKey = `algobridge.gitignoreOffered.${tmpWs}`;
    assert.strictEqual(stateMap.get(flagKey), true, 'R-H3 (T6-10): workspaceState flag must be set to true');

    const updatedContent = fs.readFileSync(gitignoreFile, 'utf8');
    assert.strictEqual(
      updatedContent,
      'node_modules\n.algobridge/\n',
      'R-H3 (T6-10): Clicking "Add to .gitignore" writes entry'
    );

    // Second call to initStorage: must NOT notify again (M4 verification)
    store.initStorage();
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(notifyCount, 1, 'R-H3 (T6-10): No second notification on second call');

    // M4 verification: workspace where user dismisses prompt without adding entry
    const dismissWs = fs.mkdtempSync(path.join(os.tmpdir(), 'algobridge-dismiss-'));
    const dismissGitignore = path.join(dismissWs, '.gitignore');
    fs.writeFileSync(dismissGitignore, 'node_modules\n', 'utf8');

    const dismissStateMap = new Map<string, any>();
    const dismissContext = {
      workspaceState: {
        get: (k: string) => dismissStateMap.get(k),
        update: (k: string, v: any) => {
          dismissStateMap.set(k, v);
          return Promise.resolve();
        },
      },
    };

    let dismissNotifyCount = 0;
    vscodeModule.window.showInformationMessage = async () => {
      dismissNotifyCount++;
      return 'Later'; // user dismisses without adding
    };

    try {
      const dismissStore = new ProblemStore(dismissContext as any, dismissWs);
      dismissStore.initStorage();
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(dismissNotifyCount, 1, 'R-H3 (T6-10): First call notifies');
      assert.strictEqual(fs.readFileSync(dismissGitignore, 'utf8'), 'node_modules\n');

      // Second call when entry was NOT added: once-flag MUST prevent second prompt!
      dismissStore.initStorage();
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(
        dismissNotifyCount,
        1,
        'R-H3 (T6-10): Once-flag blocks second notification when unadded'
      );
    } finally {
      fs.rmSync(dismissWs, { recursive: true, force: true });
    }

    console.log('✓ R-H3 (T6-10) passed');

    // R-F4 (T6-9): .gitignore write denied after clicking "Add" -> warning logged, no unhandled rejection
    const readOnlyWs = fs.mkdtempSync(path.join(os.tmpdir(), 'algobridge-ro-'));
    const roGitignore = path.join(readOnlyWs, '.gitignore');
    fs.writeFileSync(roGitignore, 'node_modules\n', 'utf8');
    fs.chmodSync(roGitignore, 0o444); // read-only

    const roStateMap = new Map<string, any>();
    const roContext = {
      workspaceState: {
        get: (k: string) => roStateMap.get(k),
        update: (k: string, v: any) => {
          roStateMap.set(k, v);
          return Promise.resolve();
        },
      },
    };

    let warnLogged = false;
    const origWarn = console.warn;
    console.warn = (...args: any[]) => {
      warnLogged = true;
      origWarn(...args);
    };

    try {
      vscodeModule.window.showInformationMessage = async () => 'Add to .gitignore';
      const roStore = new ProblemStore(roContext as any, readOnlyWs);
      roStore.initStorage();
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(warnLogged, true, 'R-F4 (T6-9): Warning logged when .gitignore write fails');
      console.log('✓ R-F4 (T6-9) passed');
    } finally {
      console.warn = origWarn;
      try {
        fs.chmodSync(roGitignore, 0o666);
        fs.rmSync(readOnlyWs, { recursive: true, force: true });
      } catch {}
    }
  } finally {
    vscodeModule.window.showInformationMessage = originalShowInfo;
    fs.rmSync(tmpWs, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runGitignoreTests();
}
