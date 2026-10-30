import * as assert from 'assert';
import { handleActiveEditorChange, activate, deactivate } from '../extension';

export async function runEditorHandlerTests() {
  console.log('--- Running EditorHandler Tests (T4-2, T6-1..T6-4, I7) ---');

  let shownProblem: any = null;
  let cleared = false;
  let storeReadCount = 0;
  let attachCount = 0;

  const mockProblemView = {
    showProblem: (p: any) => { shownProblem = p; },
    clear: () => { cleared = true; },
  };

  const statPayload = { name: 'P', url: 'u', statementHtml: 's' };
  const mockStore = {
    getStat: (path: string) => {
      storeReadCount++;
      if (path === '/ws/test.cpp') {
        return { payload: statPayload };
      }
      return undefined;
    },
    attachToFile: async () => {
      attachCount++;
    },
  };

  // R-B2 (I7): Table-driven test over schemes and undefined editor
  const cases: Array<{
    name: string;
    editor: any;
    expectedRead: number;
    expectedShown: any;
  }> = [
    { name: 'untitled', editor: { document: { uri: { scheme: 'untitled', fsPath: '/Untitled-1' } } }, expectedRead: 0, expectedShown: null },
    { name: 'git', editor: { document: { uri: { scheme: 'git', fsPath: '/repo/.git' } } }, expectedRead: 0, expectedShown: null },
    { name: 'output', editor: { document: { uri: { scheme: 'output', fsPath: '/output.log' } } }, expectedRead: 0, expectedShown: null },
    { name: 'vscode-userdata', editor: { document: { uri: { scheme: 'vscode-userdata', fsPath: '/user/settings.json' } } }, expectedRead: 0, expectedShown: null },
    { name: 'vscode-notebook-cell', editor: { document: { uri: { scheme: 'vscode-notebook-cell', fsPath: '/cell' } } }, expectedRead: 0, expectedShown: null },
    { name: 'undefined editor', editor: undefined, expectedRead: 0, expectedShown: null },
    { name: 'file: control row', editor: { document: { uri: { scheme: 'file', fsPath: '/ws/test.cpp' } } }, expectedRead: 1, expectedShown: statPayload },
  ];

  for (const tc of cases) {
    storeReadCount = 0;
    attachCount = 0;
    shownProblem = null;
    cleared = false;

    assert.doesNotThrow(() => {
      handleActiveEditorChange(tc.editor, mockStore as any, mockProblemView as any);
    }, `R-B2 (I7): ${tc.name} must not throw`);

    assert.strictEqual(storeReadCount, tc.expectedRead, `R-B2 (I7): ${tc.name} expected ${tc.expectedRead} store reads`);
    assert.strictEqual(attachCount, 0, `R-B2 (I7): ${tc.name} attachToFile count must be 0`);
    assert.strictEqual(shownProblem, tc.expectedShown, `R-B2 (I7): ${tc.name} view matching`);
  }
  console.log('✓ R-B2 (I7) table-driven passed');

  // T6-1: file: scheme with stat -> shows problem
  storeReadCount = 0;
  shownProblem = null;
  const fileEditor = {
    document: { uri: { scheme: 'file', fsPath: '/ws/test.cpp' } },
  };
  handleActiveEditorChange(fileEditor as any, mockStore as any, mockProblemView as any);
  assert.strictEqual(shownProblem, statPayload, 'T6-1: Shows problem for file with stat');
  console.log('✓ T6-1, T6-2, T6-3 passed');

  // T6-4 / R-H4: Call activate(ctx) twice with stub context
  // onDidChangeActiveTextEditor registration spy count = 1
  let editorListenerRegistrations = 0;
  const editorDisposable = { dispose: () => {} };
  const vscodeModule = require('vscode');
  const originalOnDidChange = vscodeModule.window.onDidChangeActiveTextEditor;

  vscodeModule.window.onDidChangeActiveTextEditor = (listener: any) => {
    editorListenerRegistrations++;
    return editorDisposable;
  };

  const dummyContext = {
    subscriptions: [] as Array<{ dispose: () => void }>,
    workspaceState: { get: () => undefined, update: () => Promise.resolve() },
  };

  await deactivate();
  try {
    await activate(dummyContext as any);
    await activate(dummyContext as any);

    assert.strictEqual(
      editorListenerRegistrations,
      1,
      'R-H4 (T6-4): onDidChangeActiveTextEditor registration count must be 1 on double activate'
    );
    const matched = dummyContext.subscriptions.filter((s) => s === editorDisposable);
    assert.strictEqual(
      matched.length,
      1,
      'R-H4 (T6-4): subscriptions has one editor-handler disposable'
    );
    console.log('✓ R-H4 (T6-4) passed');
  } finally {
    vscodeModule.window.onDidChangeActiveTextEditor = originalOnDidChange;
    await deactivate();
  }
}

if (require.main === module) {
  runEditorHandlerTests();
}
