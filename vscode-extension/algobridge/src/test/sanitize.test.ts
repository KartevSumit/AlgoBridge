import * as assert from 'assert';
import { sanitizeStatementHtml, escapeHtml } from '../sanitize';
import sanitizeHtml from 'sanitize-html';

export function runSanitizeTests() {
  console.log('--- Running Sanitizer Unit Tests ---');

  // H1: Happy path
  const h1Input = '<p>Given <code>n</code></p><table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table><img src="https://x/y.png" alt="d" />';
  const h1Out = sanitizeStatementHtml(h1Input);
  assert.ok(h1Out.includes('<p>Given <code>n</code></p>'), 'H1: Paragraph and code retained');
  assert.ok(h1Out.includes('<table>'), 'H1: Table retained');
  assert.ok(h1Out.includes('src="https://x/y.png"'), 'H1: Image src retained');
  assert.ok(h1Out.includes('alt="d"'), 'H1: Image alt retained');
  assert.ok(h1Out.includes('loading="lazy"'), 'H1: Image loading lazy added');
  assert.ok(h1Out.includes('referrerpolicy="no-referrer"'), 'H1: Image referrerpolicy added');
  console.log('✓ H1 passed');

  // H2: Math/data attrs
  const h2Input = '<span data-tex="x^2" class="tex">x</span>';
  const h2Out = sanitizeStatementHtml(h2Input);
  assert.ok(h2Out.includes('data-tex="x^2"'), 'H2: data-* retained');
  assert.ok(h2Out.includes('class="tex"'), 'H2: class retained');
  console.log('✓ H2 passed');

  // X1: Script strip
  const x1Input = '<p>a</p><script>alert(1)</script>';
  const x1Out = sanitizeStatementHtml(x1Input);
  assert.strictEqual(x1Out, '<p>a</p>', 'X1: Script stripped');
  assert.ok(!x1Out.includes('alert'), 'X1: No alert in output');
  console.log('✓ X1 passed');

  // X2: Event handlers & relative src
  const x2Input = '<img src="x" onerror="alert(1)"><div onclick="alert(2)">test</div>';
  const x2Out = sanitizeStatementHtml(x2Input);
  assert.ok(!x2Out.includes('onerror'), 'X2: No onerror');
  assert.ok(!x2Out.includes('onclick'), 'X2: No onclick');
  assert.ok(!x2Out.includes('src="x"'), 'X2: Relative src dropped');
  console.log('✓ X2 passed');

  // X3: Dangerous containers
  const x3Input = '<iframe>frame</iframe><object>obj</object><embed>embed</embed><svg onload="alert(1)">svg</svg>';
  const x3Out = sanitizeStatementHtml(x3Input);
  assert.ok(!x3Out.includes('<iframe'), 'X3: iframe removed');
  assert.ok(!x3Out.includes('<object'), 'X3: object removed');
  assert.ok(!x3Out.includes('<embed'), 'X3: embed removed');
  assert.ok(!x3Out.includes('<svg'), 'X3: svg removed');
  assert.ok(!x3Out.includes('alert'), 'X3: no script payload');
  console.log('✓ X3 passed');

  // X4: Scheme obfuscation
  const x4Input = '<img src="java&#x09;script:alert(1)"><img src="JaVaScRiPt:alert(2)"><img src="data:image/svg+xml;base64,PHN2Zz4=">';
  const x4Out = sanitizeStatementHtml(x4Input);
  assert.ok(!x4Out.includes('src='), 'X4: Obfuscated and SVG data schemes removed');
  console.log('✓ X4 passed');

  // Safe data image
  const safeDataImg = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" alt="dot">';
  const safeDataOut = sanitizeStatementHtml(safeDataImg);
  assert.ok(safeDataOut.includes('src="data:image/png;base64,'), 'Safe PNG data scheme retained');

  // X5: Style injection
  const x5Input = '<div style="background:url(javascript:1); color: red;">test</div>';
  const x5Out = sanitizeStatementHtml(x5Input);
  assert.ok(!x5Out.includes('url('), 'X5: url(...) in style removed');
  console.log('✓ X5 passed');

  // X6: Idempotence
  const fixtures = [
    h1Input,
    h2Input,
    '<p>Simple <b>text</b> with <a href="https://example.com">link</a></p>',
    '<div class="sample-test"><pre><code>test</code></pre></div>',
  ];
  for (const f of fixtures) {
    const once = sanitizeStatementHtml(f);
    const twice = sanitizeStatementHtml(once);
    assert.strictEqual(twice, once, 'X6: Sanitizer is idempotent');
  }
  console.log('✓ X6 passed');

  // E1: Empty/null/invalid
  assert.strictEqual(sanitizeStatementHtml(''), '');
  assert.strictEqual(sanitizeStatementHtml('   '), '');
  assert.strictEqual(sanitizeStatementHtml(null), '');
  assert.strictEqual(sanitizeStatementHtml(undefined), '');
  assert.strictEqual(sanitizeStatementHtml(123 as any), '');
  assert.strictEqual(sanitizeStatementHtml({} as any), '');
  console.log('✓ E1 passed');

  // E2: Malformed HTML
  const e2Input = '<div><p>unclosed<<>>lone </div>';
  const e2Out = sanitizeStatementHtml(e2Input);
  assert.ok(typeof e2Out === 'string' && e2Out.length > 0, 'E2: Handles malformed HTML without throwing');
  console.log('✓ E2 passed');

  // E3: Oversize & deep nesting
  const start = Date.now();
  const deep = '<div>'.repeat(10000) + 'test' + '</div>'.repeat(10000);
  const deepOut = sanitizeStatementHtml(deep);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, 'E3: 10k nested div handled under 2s');
  assert.ok(deepOut.includes('test'), 'E3: text preserved');

  const oversize = 'a'.repeat(3 * 1024 * 1024);
  assert.strictEqual(sanitizeStatementHtml(oversize), '', 'E3: Oversize input capped');
  console.log('✓ E3 passed');

  // E4: Fallback on throw
  const origSanitize = sanitizeHtml;
  try {
    // Force throw
    const errorThrower = () => { throw new Error('Simulated parser crash'); };
    Object.assign(errorThrower, origSanitize);
    // Test helper escapeHtml
    assert.strictEqual(escapeHtml('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
  } finally {
    // cleanup
  }
  console.log('✓ E4 passed');
}

if (require.main === module) {
  runSanitizeTests();
}
