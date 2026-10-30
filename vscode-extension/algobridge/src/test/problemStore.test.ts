import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ProblemStore, canonicalKey } from '../problemStore';

export function runProblemStoreTests() {
  console.log('--- Running ProblemStore Tests (T4-5, T5-10, T5-11) ---');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algobridge-test-'));
  const mockContext = {
    workspaceState: { get: () => undefined, update: () => Promise.resolve() },
  } as any;

  try {
    const store = new ProblemStore(mockContext, tmpDir);

    // T4-5: API surface - pending must NOT exist
    assert.strictEqual('setPending' in store, false, 'store must not have setPending');
    assert.strictEqual('attachPendingIfAny' in store, false, 'store must not have attachPendingIfAny');
    assert.strictEqual('pending' in (store as any), false, 'store must not have pending property');
    console.log('✓ T4-5 passed');

    // T5-10: Canonical key check (symlinks and canonical resolution)
    const testFile = path.join(tmpDir, 'test.cpp');
    fs.writeFileSync(testFile, '// test');
    const symlinkFile = path.join(tmpDir, 'link.cpp');
    try {
      fs.symlinkSync(testFile, symlinkFile);
    } catch {}

    const key1 = canonicalKey(testFile);
    assert.ok(typeof key1 === 'string' && key1.length > 0, 'canonicalKey returns valid key');

    if (fs.existsSync(symlinkFile)) {
      const keySymlink = canonicalKey(symlinkFile);
      assert.strictEqual(keySymlink, key1, 'canonicalKey resolves symlink to real path');
    }
    console.log('✓ T5-10 passed');

    // T5-10 / R-B1: Non-existent target file canonical key resolution
    const realDir = path.join(tmpDir, 'real');
    const linkDir = path.join(tmpDir, 'link');
    fs.mkdirSync(realDir, { recursive: true });
    try {
      fs.symlinkSync(realDir, linkDir, 'dir');
    } catch {}

    const nonExistentViaLink = path.join(linkDir, 'NewProblem.cpp');
    const nonExistentViaReal = path.join(realDir, 'NewProblem.cpp');
    assert.strictEqual(fs.existsSync(nonExistentViaLink), false, 'Target must not exist');

    const keyViaLink = canonicalKey(nonExistentViaLink);
    const keyViaReal = canonicalKey(nonExistentViaReal);
    assert.strictEqual(
      keyViaLink,
      keyViaReal,
      'R-B1 (T5-10): Non-existent target canonicalKey resolves realpath(dirname) + basename'
    );

    // T5-11 / R-F2: Corrupt .stat file read is read-only, file kept on disk unchanged
    const statDir = path.join(tmpDir, '.algobridge');
    if (!fs.existsSync(statDir)) fs.mkdirSync(statDir, { recursive: true });
    const corruptFile = path.join(statDir, 'corrupt.stat');
    const corruptContent = '{ invalid json format';
    fs.writeFileSync(corruptFile, corruptContent, 'utf8');

    // Reload
    store.loadFromWorkspace();

    // Verify .stat file bytes are completely unchanged on disk
    assert.ok(fs.existsSync(corruptFile), 'R-F2 (T5-11): Corrupt .stat file must NOT be deleted');
    const contentAfter = fs.readFileSync(corruptFile, 'utf8');
    assert.strictEqual(contentAfter, corruptContent, 'R-F2 (T5-11): Corrupt .stat file bytes must be unchanged');
    console.log('✓ R-B1 (T5-10) passed');
    console.log('✓ R-F2 (T5-11) passed');
    console.log('✓ T5-11 passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runProblemStoreTests();
}
