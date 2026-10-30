import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { identityEquals, buildStat } from '../identity';
import { ProblemPayload } from '../problemView';

export function runIdentityTests() {
  console.log('--- Running Identity & Schema Tests (T5-3, T5-12) ---');

  // T5-3: identityEquals truth table
  // 1. undefined vs undefined (equal)
  assert.strictEqual(identityEquals({}, {}), true, 'undefined vs undefined must be equal');

  // 2. 'CF' vs 'cf' (equal)
  assert.strictEqual(
    identityEquals({ platform: 'CF' }, { platform: 'cf' }),
    true,
    "'CF' vs 'cf' must be equal"
  );

  // 3. 1234 vs '1234' (equal)
  assert.strictEqual(
    identityEquals({ contestId: '1234' }, { contestId: 1234 as any }),
    true,
    "1234 vs '1234' must be equal"
  );

  // 4. 'A' vs 'a' (not equal, case-sensitive index)
  assert.strictEqual(
    identityEquals({ index: 'A' }, { index: 'a' }),
    false,
    "'A' vs 'a' must NOT be equal"
  );

  // 5. all-undefined vs defined (not equal, C3 legacy vs defined)
  assert.strictEqual(
    identityEquals({}, { platform: 'codeforces', contestId: '1', index: 'A' }),
    false,
    'all-undefined vs defined must NOT be equal'
  );
  assert.strictEqual(
    identityEquals({ platform: 'codeforces', contestId: '1', index: 'A' }, {}),
    false,
    'defined vs all-undefined must NOT be equal'
  );

  // 6. whitespace-padded values (equal)
  assert.strictEqual(
    identityEquals(
      { platform: ' codeforces ', contestId: ' 123 ', index: 'A' },
      { platform: 'codeforces', contestId: '123', index: 'A' }
    ),
    true,
    'whitespace-padded values must be equal'
  );

  console.log('✓ T5-3 passed');

  // buildStat tests (C1, C2)
  const problem: ProblemPayload = {
    name: 'Test Problem',
    url: 'https://codeforces.com/contest/1/problem/A',
    statementHtml: '<p>statement</p>',
    platform: 'Codeforces',
    contestId: '1',
    index: 'A',
  };
  const stat = buildStat(problem, '/workspace/A.cpp');
  assert.strictEqual(stat.sourceFile, '/workspace/A.cpp');
  assert.strictEqual(stat.platform, 'Codeforces');
  assert.strictEqual(stat.contestId, '1');
  assert.strictEqual(stat.index, 'A');
  assert.deepStrictEqual(stat.payload, problem);
  console.log('✓ buildStat passed');

  // T5-12: Schema alignment
  const schemaPath = path.resolve(__dirname, '../../../../protocol/problem.schema.json');
  if (fs.existsSync(schemaPath)) {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(typeof schema.platform, 'string');
    assert.strictEqual(typeof schema.contestId, 'string');
    assert.strictEqual(typeof schema.index, 'string');
  }
  console.log('✓ T5-12 passed');
}

if (require.main === module) {
  runIdentityTests();
}
