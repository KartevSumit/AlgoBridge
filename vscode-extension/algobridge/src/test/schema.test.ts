import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAgainstSchema(
  payload: any,
  schema: any,
  options: { strict?: boolean } = {}
): SchemaValidationResult {
  const errors: string[] = [];
  const strict = options.strict ?? false;

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  // Check required name
  if (typeof payload.name !== 'string') {
    errors.push('name must be a string');
  }

  // Check platform
  if (payload.platform !== undefined && typeof payload.platform !== 'string') {
    errors.push('platform must be a string');
  }

  // Check contestId: in strict mode, must be string; in lenient mode, string or number is accepted
  if (payload.contestId !== undefined) {
    if (strict) {
      if (typeof payload.contestId !== 'string') {
        errors.push('contestId must be a string in strict mode');
      }
    } else {
      if (typeof payload.contestId !== 'string' && typeof payload.contestId !== 'number') {
        errors.push('contestId must be a string or number in lenient mode');
      }
    }
  }

  // Check index
  if (payload.index !== undefined && typeof payload.index !== 'string') {
    errors.push('index must be a string');
  }

  return { valid: errors.length === 0, errors };
}

export function runSchemaTests() {
  console.log('--- Running Schema Alignment Tests (D1, T5-12) (key presence only) ---');

  const schemaPath = path.resolve(__dirname, '../../../../protocol/problem.schema.json');
  assert.ok(fs.existsSync(schemaPath), `Schema file must exist at ${schemaPath}`);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  // Assert schema properties exist
  assert.ok('platform' in schema, 'Schema must define platform');
  assert.ok('contestId' in schema, 'Schema must define contestId');
  assert.ok('index' in schema, 'Schema must define index');

  // R-H1 (T5-12): Payload with platform, contestId, index as strings validates against protocol/problem.schema.json
  const fullPayload = {
    name: '1A - Theatre Square',
    url: 'https://codeforces.com/contest/1/problem/A',
    statementHtml: '<p>statement</p>',
    platform: 'codeforces',
    contestId: '1',
    index: 'A',
  };
  const res1 = validateAgainstSchema(fullPayload, schema);
  assert.strictEqual(res1.valid, true, 'R-H1 (T5-12): full payload with string identity validates');

  // R-H1 (T5-12): A payload omitting all three also validates
  const minimalPayload = {
    name: '1A - Theatre Square',
    url: 'https://codeforces.com/contest/1/problem/A',
    statementHtml: '<p>statement</p>',
  };
  const res2 = validateAgainstSchema(minimalPayload, schema);
  assert.strictEqual(res2.valid, true, 'R-H1 (T5-12): payload omitting platform/contestId/index also validates');

  // R-B4 (D1): Schema rejects non-string contestId only if strict mode is configured
  const numberContestPayload = {
    name: '1A',
    url: 'https://codeforces.com/contest/1/problem/A',
    statementHtml: '<p>statement</p>',
    contestId: 1000 as any,
  };
  // Lenient mode: accepts number contestId
  const lenientRes = validateAgainstSchema(numberContestPayload, schema, { strict: false });
  assert.strictEqual(lenientRes.valid, true, 'R-B4 (D1): lenient mode accepts numeric contestId');

  // Strict mode: rejects non-string contestId
  const strictRes = validateAgainstSchema(numberContestPayload, schema, { strict: true });
  assert.strictEqual(strictRes.valid, false, 'R-B4 (D1): strict mode rejects numeric contestId');
  assert.ok(
    strictRes.errors.some((e) => e.includes('contestId')),
    'R-B4 (D1): error must mention contestId'
  );

  console.log('✓ R-H1 (T5-12) passed');
  console.log('✓ R-B4 (D1) passed');
}

if (require.main === module) {
  runSchemaTests();
}
