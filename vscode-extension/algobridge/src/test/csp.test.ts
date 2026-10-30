import * as assert from 'assert';
import { buildCsp, generateNonce } from '../sanitize';
import { ProblemViewProvider, ProblemPayload } from '../problemView';

export function runCspTests() {
  console.log('--- Running CSP & Integration Unit Tests ---');

  // C1: CSP exact string
  const expectedCsp = "default-src 'none'; base-uri 'none'; style-src vscode-webview://x 'unsafe-inline'; script-src 'nonce-abc='; font-src vscode-webview://x; img-src vscode-webview://x https: data:";
  const csp1 = buildCsp('vscode-webview://x', 'abc=');
  assert.strictEqual(csp1, expectedCsp, 'C1: CSP string exactly matches specification');
  assert.ok(csp1.includes("base-uri 'none'"), 'C1: Contains base-uri none');
  assert.ok(!csp1.includes('unsafe-eval'), 'C1: No unsafe-eval');
  assert.ok(!csp1.includes('*'), 'C1: No wildcard');
  assert.ok(!csp1.includes('http:'), 'C1: No http: scheme');
  console.log('✓ C1 passed');

  // C3: Bad CSP inputs
  assert.throws(() => buildCsp('vscode-webview://x', ''), 'C3: Empty nonce throws');
  assert.throws(() => buildCsp('vscode-webview://x', "abc'def"), "C3: Nonce with single quote throws");
  assert.throws(() => buildCsp('vscode-webview://x', "abc;def"), "C3: Nonce with semicolon throws");
  assert.throws(() => buildCsp('vscode-webview://x', "abc def"), "C3: Nonce with whitespace throws");
  assert.throws(() => buildCsp('', 'abc='), 'C3: Empty cspSource throws');
  console.log('✓ C3 passed');

  // Integration with buildHtml
  const mockContext = {
    extensionUri: { fsPath: '/test/path' } as any,
  } as any;
  const provider = new ProblemViewProvider(mockContext);

  const sampleProblem: ProblemPayload = {
    name: 'Sample 1A',
    url: 'https://codeforces.com/contest/1/problem/A',
    statementHtml: '<p>Sample statement with <code>math</code></p><script>alert(1)</script>',
  };

  const stubWebview = {
    cspSource: 'vscode-webview://test-host',
  };

  const stubAssets = {
    katexCss: 'vscode-webview://test-host/katex.min.css',
    katexJs: 'vscode-webview://test-host/katex.min.js',
    katexAutoRenderJs: 'vscode-webview://test-host/auto-render.min.js',
  };

  const html = provider.buildHtml(sampleProblem, stubWebview, stubAssets);

  // C2: CSP position
  const cspMetaPos = html.indexOf('<meta http-equiv="Content-Security-Policy"');
  const firstLinkPos = html.indexOf('<link');
  const firstScriptPos = html.indexOf('<script');
  assert.ok(cspMetaPos > 0, 'C2: CSP meta present');
  assert.ok(cspMetaPos < firstLinkPos, 'C2: CSP meta precedes first link tag');
  assert.ok(cspMetaPos < firstScriptPos, 'C2: CSP meta precedes first script tag');
  console.log('✓ C2 passed');

  // H3: Nonce uniqueness (1000x calls)
  const nonces = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const rendered = provider.buildHtml(sampleProblem, stubWebview, stubAssets);
    const m = rendered.match(/script-src 'nonce-([A-Za-z0-9+/=]+)'/);
    assert.ok(m, 'H3: CSP contains nonce');
    const nonce = m[1];
    assert.ok(!nonces.has(nonce), 'H3: Nonce is unique');
    nonces.add(nonce);
    const buf = Buffer.from(nonce, 'base64');
    assert.strictEqual(buf.length, 16, 'H3: Nonce decodes to 16 bytes');
  }
  assert.strictEqual(nonces.size, 1000, 'H3: 1000 unique nonces generated');
  console.log('✓ H3 passed');

  // H4: Nonce coverage
  const scriptTagRegex = /<script\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  let scriptCount = 0;
  const cspNonceMatch = html.match(/script-src 'nonce-([A-Za-z0-9+/=]+)'/);
  assert.ok(cspNonceMatch, 'CSP nonce found');
  const activeNonce = cspNonceMatch[1];

  while ((match = scriptTagRegex.exec(html)) !== null) {
    scriptCount++;
    const attrs = match[1];
    assert.ok(attrs.includes(`nonce="${activeNonce}"`), `H4: Script tag ${scriptCount} carries active nonce`);
  }
  assert.strictEqual(scriptCount, 3, 'H4: Exactly 3 script tags present');
  console.log('✓ H4 passed');

  // A1: Offline check
  assert.ok(!html.includes('cdnjs'), 'A1: No cdnjs');
  assert.ok(!html.includes('jsdelivr'), 'A1: No jsdelivr');
  assert.ok(!html.includes('unpkg'), 'A1: No unpkg');
  console.log('✓ A1 passed');

  // A2: Forbidden schemes
  assert.ok(!html.includes('vscode-resource:'), 'A2: No vscode-resource:');
  assert.ok(!html.includes('file://'), 'A2: No file://');
  console.log('✓ A2 passed');

  // A3: Missing KaTeX asset (renders safely)
  const missingAssetHtml = provider.buildHtml(sampleProblem, stubWebview, {
    katexCss: 'vscode-webview://test-host/404.css',
    katexJs: 'vscode-webview://test-host/404.js',
    katexAutoRenderJs: 'vscode-webview://test-host/404-auto.js',
  });
  assert.ok(missingAssetHtml.includes('Sample statement with'), 'A3: Renders content safely');
  console.log('✓ A3 passed');

  // Fallback rendering
  const nullProblemHtml = provider.buildHtml(null, stubWebview, stubAssets);
  assert.ok(nullProblemHtml.includes('No problem is currently selected.'), 'Null problem fallback');
  console.log('✓ Null problem fallback passed');
}

if (require.main === module) {
  runCspTests();
}
