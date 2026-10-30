import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ProblemStore } from '../problemStore';

export async function runIsolationTests() {
  console.log('--- Running Isolation Tests (B1) ---');

  // H-ISO1 (B1): The root .gitignore bytes are identical before and after, and free of test residue
  const rootGitignorePath = path.resolve(__dirname, '../../../../.gitignore');
  const bytesBefore = fs.existsSync(rootGitignorePath) ? fs.readFileSync(rootGitignorePath, 'utf8') : null;

  if (bytesBefore !== null) {
    assert.strictEqual(
      bytesBefore.includes('.algobridge/'),
      false,
      'H-ISO1 (B1): Root .gitignore must not contain .algobridge/ test residue'
    );
  }

  // B-ISO2 (B1): initStorage() run against a fresh temp workspace with a .gitignore writes only inside that temp dir.
  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'algobridge-iso-'));
  const tmpGitignore = path.join(tmpWs, '.gitignore');
  fs.writeFileSync(tmpGitignore, 'node_modules/\n', 'utf8');

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

  const vscodeModule = require('vscode');
  const origShowInfo = vscodeModule.window.showInformationMessage;
  vscodeModule.window.showInformationMessage = async () => 'Add to .gitignore';

  try {
    const store = new ProblemStore(mockContext as any, tmpWs);
    store.initStorage();
    await new Promise((r) => setTimeout(r, 20));

    // Verify temp workspace .gitignore updated
    const updatedTmp = fs.readFileSync(tmpGitignore, 'utf8');
    assert.strictEqual(
      updatedTmp,
      'node_modules/\n.algobridge/\n',
      'B-ISO2 (B1): temp workspace .gitignore updated'
    );

    // Verify root .gitignore was not touched by initStorage on temp workspace
    if (bytesBefore !== null) {
      const bytesAfter = fs.readFileSync(rootGitignorePath, 'utf8');
      assert.strictEqual(
        bytesAfter,
        bytesBefore,
        'H-ISO1 (B1): Root .gitignore must be untouched by test runs'
      );
    }
    console.log('✓ B-ISO2 (B1) passed');
    console.log('✓ H-ISO1 (B1) passed');
  } finally {
    vscodeModule.window.showInformationMessage = origShowInfo;
    fs.rmSync(tmpWs, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runIsolationTests();
}
