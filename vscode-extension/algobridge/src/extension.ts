import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';

import { ProblemViewProvider, ProblemPayload } from './problemView';
import { ProblemStore } from './problemStore';

import { problemNameToFilePrefix } from './problemNameToBase';
import { findProblemFile } from './findProblemFile';
import { createProblemFile } from './createProblemFile';

/* ---------------- Security & Guard Constants ---------------- */

export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  '127.0.0.1:27123',
  'localhost:27123',
]);

export const ALLOWED_ORIGIN_PREFIXES = [
  'chrome-extension://',
  'moz-extension://',
] as const;

export const ALLOWED_REQUEST_HEADERS = 'Content-Type, X-AlgoBridge-Token';

export const ALLOWED_METHODS = 'POST, OPTIONS';

export type GuardResult =
  | { ok: true }
  | { ok: false; status: 403 | 415; reason: string };

export function checkHost(req: http.IncomingMessage): GuardResult {
  const host = typeof req.headers.host === 'string' ? req.headers.host.toLowerCase() : '';
  return host && ALLOWED_HOSTS.has(host)
    ? { ok: true }
    : { ok: false, status: 403, reason: 'FORBIDDEN_HOST' };
}

export function checkOrigin(req: http.IncomingMessage): GuardResult {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const valid = origin !== 'null' && ALLOWED_ORIGIN_PREFIXES.some((p) => origin.startsWith(p) && origin.length > p.length);
  return valid
    ? { ok: true }
    : { ok: false, status: 403, reason: 'FORBIDDEN_ORIGIN' };
}

export function checkContentType(req: http.IncomingMessage): GuardResult {
  const ct = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'].toLowerCase() : '';
  return ct.includes('application/json')
    ? { ok: true }
    : { ok: false, status: 415, reason: 'UNSUPPORTED_CONTENT_TYPE' };
}

/* ---------------- Response Helpers ---------------- */

export function reject(
  res: http.ServerResponse,
  result: Extract<GuardResult, { ok: false }>
): void {
  if (res.headersSent) {
    return;
  }
  res.writeHead(result.status, {
    'Content-Type': 'text/plain',
  });
  res.end(result.reason);
}

export function applyCors(res: http.ServerResponse, origin: string): void {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_REQUEST_HEADERS);
}

/* ---------------- Globals ---------------- */

let server: http.Server | null = null;
let problemView: ProblemViewProvider;
let store: ProblemStore;

/* ---------------- Activation ---------------- */

export async function activate(context: vscode.ExtensionContext) {
  console.log('ALGOBRIDGE EXTENSION ACTIVATED');

  store = new ProblemStore(context);
  console.log(`[AlgoBridge] Storage initialized in workspace.`);
  problemView = new ProblemViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('algobridge.problemView', problemView)
  );

  /* ---------- HTTP server ---------- */

  server = http.createServer(async (req, res) => {
    try {
      const hostResult = checkHost(req);
      if (!hostResult.ok) {
        req.resume();
        reject(res, hostResult);
        return;
      }

      const originResult = checkOrigin(req);
      if (!originResult.ok) {
        req.resume();
        reject(res, originResult);
        return;
      }

      const origin = req.headers.origin as string;
      applyCors(res, origin);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method !== 'POST' || req.url !== '/problem') {
        req.resume();
        res.writeHead(404);
        res.end();
        return;
      }

      const contentTypeResult = checkContentType(req);
      if (!contentTypeResult.ok) {
        req.resume();
        reject(res, contentTypeResult);
        return;
      }

      let body = '';
      req.on('data', (chunk) => (body += chunk));

      req.on('end', async () => {
        try {
          const problem: ProblemPayload = JSON.parse(body);

          const base = problemNameToFilePrefix(problem.name);

          vscode.commands.executeCommand('workbench.view.extension.algobridgeContainer');

          let file = await findProblemFile(base);

          if (!file) {
            const choice = await vscode.window.showInformationMessage(
              `No file found for "${base}". Create ${base}.cpp?`,
              'Create',
              'Cancel'
            );

            if (choice === 'Create') {
              file = await createProblemFile(base);
            }
          }

          if (file) {
            const doc = await vscode.workspace.openTextDocument(file);
            await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
            store.attachToFile(file.fsPath, problem);
            problemView.showProblem(problem);
          } else {
            store.setPending(problem);
          }

          res.writeHead(200);
          res.end('OK');
        } catch (e) {
          console.error('Invalid payload', e);
          res.writeHead(400);
          res.end('Invalid payload');
        }
      });
    } catch (err) {
      console.error('[AlgoBridge] Request error:', err);
      if (!res.headersSent) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
      }
    }
  });

  server.listen(27123, '127.0.0.1');
  server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error('[AlgoBridge] Port 27123 is already in use.');
      vscode.window.showWarningMessage('AlgoBridge server could not start: port 27123 is already in use.');
    } else {
      console.error('[AlgoBridge] Server error:', err);
      vscode.window.showErrorMessage(`AlgoBridge server failed: ${err?.message || err}`);
    }
  });

  /* ---------- Editor change handling ---------- */

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        problemView.clear();
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const base = path.basename(filePath).replace(/\.\w+$/, '');

      const attached = store.attachPendingIfAny(editor);

      if (attached) {
        problemView.showProblem(attached);
        return;
      }

      const problem = store.getForFile(filePath) || store.getByBaseName(base);
      problem ? problemView.showProblem(problem) : problemView.clear();
    })
  );

  syncWithEditor(vscode.window.activeTextEditor);
}

function syncWithEditor(editor?: vscode.TextEditor) {
  if (!editor) {
    problemView.clear();
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const base = path.basename(filePath).replace(/\.\w+$/, '');

  const attached = store.attachPendingIfAny(editor);
  if (attached) {
    problemView.showProblem(attached);
    return;
  }

  const problem = store.getForFile(filePath) || store.getByBaseName(base);

  if (problem) {
    problemView.showProblem(problem);
  } else {
    problemView.clear();
  }
}

/* ---------------- Deactivation ---------------- */

export function deactivate() {
  server?.close();
}
