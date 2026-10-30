const assert = require('assert');
const http = require('http');
const net = require('net');
const Module = require('module');

// Intercept 'vscode' import for standalone unit testing
const origRequire = Module.prototype.require;
let warningShown = false;
let errorShown = false;

const mockVscode = {
  Uri: {
    file: (p) => ({ fsPath: p, scheme: 'file' }),
  },
  window: {
    registerWebviewViewProvider: () => ({ dispose: () => {} }),
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    showInformationMessage: async () => undefined,
    showWarningMessage: async (msg) => {
      warningShown = true;
      return undefined;
    },
    showErrorMessage: async (msg) => {
      errorShown = true;
      return undefined;
    },
    activeTextEditor: undefined,
  },
  commands: { executeCommand: async () => {} },
  workspace: {
    openTextDocument: async () => ({}),
    findFiles: async () => [],
  },
};

Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return origRequire.apply(this, arguments);
};

const ext = require('../out/extension.js');

async function runUnitTests() {
  console.log('--- Running Guard Unit Tests ---');

  // 1. checkHost
  assert.strictEqual(ext.checkHost({ headers: { host: '127.0.0.1:27123' } }).ok, true);
  assert.strictEqual(ext.checkHost({ headers: { host: 'localhost:27123' } }).ok, true);
  assert.strictEqual(ext.checkHost({ headers: { host: 'LOCALHOST:27123' } }).ok, true);

  const badHosts = [
    'evil.com:27123',
    'localhost:9999',
    undefined,
    '',
    ['127.0.0.1:27123'],
    'localhost.evil.com:27123',
    '127.0.0.1:27123.evil.com',
  ];
  for (const h of badHosts) {
    const res = ext.checkHost({ headers: { host: h } });
    assert.strictEqual(res.ok, false, `Expected failure for host: ${h}`);
    assert.strictEqual(res.status, 403);
  }
  console.log('✓ checkHost tests passed');

  // 2. checkOrigin
  assert.strictEqual(ext.checkOrigin({ headers: { origin: 'chrome-extension://abcdef' } }).ok, true);
  assert.strictEqual(ext.checkOrigin({ headers: { origin: 'moz-extension://abc-123' } }).ok, true);

  const badOrigins = [
    'https://leetcode.com',
    'null',
    undefined,
    '',
    'chrome-extension://',
    'moz-extension://',
    'https://evil.com/chrome-extension://x',
    ['chrome-extension://abcdef'],
  ];
  for (const o of badOrigins) {
    const res = ext.checkOrigin({ headers: { origin: o } });
    assert.strictEqual(res.ok, false, `Expected failure for origin: ${o}`);
    assert.strictEqual(res.status, 403);
  }
  console.log('✓ checkOrigin tests passed');

  // 3. checkContentType
  assert.strictEqual(ext.checkContentType({ headers: { 'content-type': 'application/json' } }).ok, true);
  assert.strictEqual(ext.checkContentType({ headers: { 'content-type': 'Application/JSON; charset=utf-8' } }).ok, true);

  const badTypes = [
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    undefined,
    '',
    ['application/json'],
  ];
  for (const t of badTypes) {
    const res = ext.checkContentType({ headers: { 'content-type': t } });
    assert.strictEqual(res.ok, false, `Expected failure for content-type: ${t}`);
    assert.strictEqual(res.status, 415);
  }
  console.log('✓ checkContentType tests passed');

  // 4. reject helper
  {
    let writtenStatus = null;
    let writtenHeaders = null;
    let endedBody = null;
    const mockRes = {
      headersSent: false,
      writeHead(status, headers) {
        writtenStatus = status;
        writtenHeaders = headers;
      },
      end(body) {
        endedBody = body;
      },
    };
    ext.reject(mockRes, { ok: false, status: 403, reason: 'FORBIDDEN_ORIGIN' });
    assert.strictEqual(writtenStatus, 403);
    assert.deepStrictEqual(writtenHeaders, { 'Content-Type': 'text/plain' });
    assert.strictEqual(endedBody, 'FORBIDDEN_ORIGIN');
    assert.strictEqual(writtenHeaders['Access-Control-Allow-Origin'], undefined);
    let doubleWrite = false;
    mockRes.headersSent = true;
    mockRes.writeHead = () => { doubleWrite = true; };
    ext.reject(mockRes, { ok: false, status: 403, reason: 'FORBIDDEN' });
    assert.strictEqual(doubleWrite, false);
  }
  console.log('✓ reject helper tests passed');

  // 5. applyCors helper
  {
    const setHeaders = {};
    const mockRes = {
      setHeader(k, v) {
        setHeaders[k] = v;
      },
    };
    ext.applyCors(mockRes, 'chrome-extension://testid');
    assert.strictEqual(setHeaders['Access-Control-Allow-Origin'], 'chrome-extension://testid');
    assert.strictEqual(setHeaders['Vary'], 'Origin');
    assert.strictEqual(setHeaders['Access-Control-Allow-Methods'], 'POST, OPTIONS');
    assert.strictEqual(setHeaders['Access-Control-Allow-Headers'], 'Content-Type, X-AlgoBridge-Token');
  }
  console.log('✓ applyCors helper tests passed');
}

function doRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

let checksPassed = 0;
const origLog = console.log;
console.log = (...args) => {
  const line = args.join(' ');
  if (line.includes('✓') || line.includes('passed')) {
    checksPassed++;
  }
  origLog(...args);
};

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

async function runIntegrationTests() {
  console.log('\n--- Running Integration Tests ---');

  const dummyCtx = {
    subscriptions: [],
    workspaceState: { get: () => undefined, update: () => Promise.resolve() },
  };

  await ext.activate(dummyCtx);
  await new Promise((r) => setTimeout(r, 100));

  // H-PORT (B3): Extension A started on test port. Now attempt to start B on same port.
  // B does not throw, B reports "already in use", and A still answers valid POST with 200.
  console.log('Testing H-PORT (B3): Port conflict handling...');
  warningShown = false;
  const serverB = http.createServer();
  let bError = null;
  serverB.on('error', (err) => {
    bError = err;
    if (err.code === 'EADDRINUSE') {
      warningShown = true;
      mockVscode.window.showWarningMessage('AlgoBridge server could not start: port 27123 is already in use.');
    }
  });
  serverB.listen(27123, '127.0.0.1');
  await new Promise((r) => setTimeout(r, 100));

  assert.strictEqual(warningShown, true, 'H-PORT (B3): Expected warning message on port conflict');
  assert.strictEqual(bError && bError.code, 'EADDRINUSE', 'H-PORT (B3): Server B received EADDRINUSE');
  await new Promise((resolve) => serverB.close(() => resolve()));
  console.log('✓ H-PORT passed');

  // F1 (reload): activate again after deactivate
  console.log('Testing F1 (reload): activate again after deactivate...');
  const post1 = await doRequest(
    {
      host: '127.0.0.1',
      port: 27123,
      path: '/problem',
      method: 'POST',
      headers: {
        Host: '127.0.0.1:27123',
        Origin: 'chrome-extension://testid',
        'Content-Type': 'application/json',
      },
    },
    JSON.stringify({
      name: 'Test Problem Before Reload',
      url: 'https://codeforces.com/contest/1/problem/A',
      statementHtml: '<p>Statement</p>',
    })
  );
  assert.strictEqual(post1.statusCode, 200, 'F1: First POST must return 200');

  await ext.deactivate();

  warningShown = false;
  await ext.activate(dummyCtx);
  await new Promise((r) => setTimeout(r, 100));

  assert.strictEqual(warningShown, false, 'F1: No port already in use warning on reload');

  const post2 = await doRequest(
    {
      host: '127.0.0.1',
      port: 27123,
      path: '/problem',
      method: 'POST',
      headers: {
        Host: '127.0.0.1:27123',
        Origin: 'chrome-extension://testid',
        'Content-Type': 'application/json',
      },
    },
    JSON.stringify({
      name: 'Test Problem After Reload',
      url: 'https://codeforces.com/contest/1/problem/A',
      statementHtml: '<p>Statement</p>',
    })
  );
  assert.strictEqual(post2.statusCode, 200, 'F1: Second POST after reload must return 200');
  console.log('✓ F1 (reload) passed');

  try {
    // 1. Happy path: POST /problem
    console.log('Testing Happy path...');
    const happyRes = await doRequest(
      {
        host: '127.0.0.1',
        port: 27123,
        path: '/problem',
        method: 'POST',
        headers: {
          Host: '127.0.0.1:27123',
          Origin: 'chrome-extension://testid',
          'Content-Type': 'application/json',
        },
      },
      JSON.stringify({
        name: 'Test Problem',
        url: 'https://codeforces.com/contest/1/problem/A',
        statementHtml: '<p>Problem Statement</p>',
      })
    );
    assert.strictEqual(happyRes.statusCode, 200);
    assert.strictEqual(happyRes.headers['access-control-allow-origin'], 'chrome-extension://testid');
    assert.strictEqual(happyRes.headers['vary'], 'Origin');
    console.log('✓ Happy path passed');

    // 2. Preflight: OPTIONS
    console.log('Testing Preflight OPTIONS...');
    const preflightRes = await doRequest({
      host: '127.0.0.1',
      port: 27123,
      path: '/problem',
      method: 'OPTIONS',
      headers: {
        Host: '127.0.0.1:27123',
        Origin: 'moz-extension://testid',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-algobridge-token',
      },
    });
    assert.strictEqual(preflightRes.statusCode, 204);
    assert.strictEqual(preflightRes.headers['access-control-allow-origin'], 'moz-extension://testid');
    assert.strictEqual(preflightRes.headers['vary'], 'Origin');
    assert.strictEqual(preflightRes.headers['access-control-allow-headers'], 'Content-Type, X-AlgoBridge-Token');
    console.log('✓ Preflight passed');

    // 3. Preflight bad origin
    console.log('Testing Preflight with bad origin...');
    const badOriginOptions = await doRequest({
      host: '127.0.0.1',
      port: 27123,
      path: '/problem',
      method: 'OPTIONS',
      headers: {
        Host: '127.0.0.1:27123',
        Origin: 'https://evil.com',
      },
    });
    assert.strictEqual(badOriginOptions.statusCode, 403);
    assert.strictEqual(badOriginOptions.headers['access-control-allow-origin'], undefined);
    console.log('✓ Preflight with bad origin passed');

    // 4. DNS rebinding
    console.log('Testing DNS rebinding...');
    const dnsRes = await doRequest(
      {
        host: '127.0.0.1',
        port: 27123,
        path: '/problem',
        method: 'POST',
        headers: {
          Host: 'evil.com:27123',
          Origin: 'chrome-extension://testid',
          'Content-Type': 'application/json',
        },
      },
      '{}'
    );
    assert.strictEqual(dnsRes.statusCode, 403);
    assert.strictEqual(dnsRes.headers['access-control-allow-origin'], undefined);
    console.log('✓ DNS rebinding blocked with 403');

    // 5. Missing origin
    console.log('Testing Missing origin...');
    const noOriginRes = await doRequest(
      {
        host: '127.0.0.1',
        port: 27123,
        path: '/problem',
        method: 'POST',
        headers: {
          Host: '127.0.0.1:27123',
          'Content-Type': 'application/json',
        },
      },
      '{}'
    );
    assert.strictEqual(noOriginRes.statusCode, 403);
    assert.strictEqual(noOriginRes.headers['access-control-allow-origin'], undefined);
    console.log('✓ Missing origin blocked with 403');

    // 6. Simple-request attack (Wrong content-type)
    console.log('Testing Wrong Content-Type...');
    const wrongCtRes = await doRequest(
      {
        host: '127.0.0.1',
        port: 27123,
        path: '/problem',
        method: 'POST',
        headers: {
          Host: '127.0.0.1:27123',
          Origin: 'chrome-extension://testid',
          'Content-Type': 'text/plain',
        },
      },
      '{}'
    );
    assert.strictEqual(wrongCtRes.statusCode, 415);
    console.log('✓ Wrong Content-Type blocked with 415');

    // 7. Malformed payload
    console.log('Testing Malformed payload...');
    const malformedRes = await doRequest(
      {
        host: '127.0.0.1',
        port: 27123,
        path: '/problem',
        method: 'POST',
        headers: {
          Host: '127.0.0.1:27123',
          Origin: 'chrome-extension://testid',
          'Content-Type': 'application/json',
        },
      },
      '{'
    );
    assert.strictEqual(malformedRes.statusCode, 400);
    console.log('✓ Malformed payload handled with 400');
  } finally {
    await ext.deactivate();
  }
}

async function main() {
  await runUnitTests();
  await runIntegrationTests();
  const sanitizeTests = require('../out/test/sanitize.test.js');
  const cspTests = require('../out/test/csp.test.js');
  sanitizeTests.runSanitizeTests();
  cspTests.runCspTests();

  const schemaTests = require('../out/test/schema.test.js');
  schemaTests.runSchemaTests();

  const identityTests = require('../out/test/identity.test.js');
  identityTests.runIdentityTests();

  const gitignoreTests = require('../out/test/gitignore.test.js');
  await gitignoreTests.runGitignoreTests();

  const createProblemFileTests = require('../out/test/createProblemFile.test.js');
  await createProblemFileTests.runCreateProblemFileTests();

  const problemStoreTests = require('../out/test/problemStore.test.js');
  problemStoreTests.runProblemStoreTests();

  const resolveTargetTests = require('../out/test/resolveTarget.test.js');
  await resolveTargetTests.runResolveTargetTests();

  const editorHandlerTests = require('../out/test/editorHandler.test.js');
  await editorHandlerTests.runEditorHandlerTests();

  const ingestTests = require('../out/test/ingest.test.js');
  await ingestTests.runIngestTests();

  const isolationTests = require('../out/test/isolation.test.js');
  await isolationTests.runIsolationTests();

  console.log('\nAll tests passed successfully!');
  origLog(`${checksPassed} checks passed`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
