import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { nextAvailableName, NoFreeNameError, createProblemFile, createFileWithRetry } from '../createProblemFile';

export async function runCreateProblemFileTests() {
  console.log('--- Running CreateProblemFile Suffix Tests (T5-8, T5-9) ---');

  // Next available name starts at _2
  const taken = new Set(['Problem', 'Problem_2']);
  const name = nextAvailableName('Problem', (n) => taken.has(n));
  assert.strictEqual(name, 'Problem_3', 'Must pick Problem_3 when Problem and Problem_2 exist');

  const takenNone = new Set(['Problem']);
  assert.strictEqual(
    nextAvailableName('Problem', (n) => takenNone.has(n)),
    'Problem_2',
    'Must pick Problem_2 when only Problem exists'
  );

  // T5-9: Suffix exhaustion
  assert.throws(
    () => {
      nextAvailableName('Problem', () => true, 10);
    },
    (err: any) => {
      assert.ok(err instanceof NoFreeNameError, 'Must throw NoFreeNameError');
      return true;
    },
    'Must throw NoFreeNameError when names exhausted'
  );

  // R-B3 (T5-9): nextAvailableName with _2.._999 all taken -> throws NoFreeNameError.
  // Boundary: _999 free -> returns Name_999.
  const takenUntil998 = (n: string) => {
    const match = n.match(/^Problem_(\d+)$/);
    if (!match) return true;
    const num = parseInt(match[1], 10);
    return num < 999;
  };
  const boundaryName = nextAvailableName('Problem', takenUntil998, 999);
  assert.strictEqual(boundaryName, 'Problem_999', 'R-B3 (T5-9): _999 free returns Name_999');

  assert.throws(
    () => {
      nextAvailableName('Problem', (n) => true, 999);
    },
    (err: any) => {
      assert.ok(err instanceof NoFreeNameError, 'R-B3 (T5-9): all taken throws NoFreeNameError');
      return true;
    }
  );
  console.log('✓ R-B3 (T5-9) passed');

  // T5-8 (R-C2): createProblemFile with 'wx' throws EEXIST when file exists
  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'algobridge-create-'));
  const origFolders = (vscode as any).workspace.workspaceFolders;
  (vscode as any).workspace.workspaceFolders = [{ uri: { fsPath: tmpWs } }];
  try {
    fs.writeFileSync(path.join(tmpWs, 'Existing.cpp'), '// existing');
    let threwEexist = false;
    try {
      await createProblemFile('Existing');
    } catch (err: any) {
      if (err && err.code === 'EEXIST') {
        threwEexist = true;
      }
    }
    assert.strictEqual(threwEexist, true, 'R-C2 (T5-8): createProblemFile must throw EEXIST when file exists');
    console.log('✓ R-C2 (T5-8) wx flag passed');
  } finally {
    (vscode as any).workspace.workspaceFolders = origFolders;
    fs.rmSync(tmpWs, { recursive: true, force: true });
  }

  // C-BASE (G5): createFile('Name') throws EEXIST with no prior collision -> result is Name_2
  {
    const taken = new Set<string>();
    const createdNames: string[] = [];
    const stubCreate = async (name: string) => {
      createdNames.push(name);
      if (name === 'Name') {
        const err: any = new Error('File already exists');
        err.code = 'EEXIST';
        throw err;
      }
      return { fsPath: `/ws/${name}.cpp` } as any;
    };

    const res = await createFileWithRetry(
      'Name',
      stubCreate,
      (n: string) => taken.has(n),
      10
    );

    assert.ok(res, 'C-BASE (G5): Must return a created URI');
    assert.strictEqual(
      res.fsPath,
      '/ws/Name_2.cpp',
      'C-BASE (G5): createFile throws EEXIST on base name -> fallback returns Name_2 without error'
    );
    assert.deepStrictEqual(
      createdNames,
      ['Name', 'Name_2'],
      'C-BASE (G5): attempted base Name then Name_2'
    );
    console.log('✓ C-BASE (G5) passed');
  }

  console.log('✓ T5-8, T5-9 passed');
}

if (require.main === module) {
  runCreateProblemFileTests();
}
