import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

import { ProblemViewProvider, ProblemPayload } from './problemView';
import { ProblemStore } from './problemStore';

import { problemNameToFilePrefix } from './problemNameToBase';
import { findProblemFile } from './findProblemFile';
import { createProblemFile, createFileWithRetry, nextAvailableName, NoFreeNameError } from './createProblemFile';
import { resolveTargetFile, TargetDeps } from './resolveTarget';

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
let ingestSeq = 0;
let activeEditorDisposable: vscode.Disposable | null = null;

export interface IngestDeps {
  resolveTarget: (problem: ProblemPayload) => Promise<{ uri: vscode.Uri; mode: 'created' | 'reused' } | undefined>;
  openDocument: (uri: vscode.Uri) => PromiseLike<any>;
  showDocument?: (doc: any) => PromiseLike<any>;
  attach: (fsPath: string, problem: ProblemPayload) => Promise<void>;
  remap: (fsPath: string, problem: ProblemPayload) => Promise<void>;
  view: { showProblem: (problem: ProblemPayload) => void };
  notify: { showErrorMessage: (msg: string) => void };
  getSeq: () => number;
  bumpSeq: () => number;
}

export async function runIngest(problem: ProblemPayload, deps: IngestDeps): Promise<void> {
  try {
    const seq = deps.bumpSeq();
    const resolved = await deps.resolveTarget(problem);
    if (seq !== deps.getSeq()) return;

    if (resolved) {
      const doc = await deps.openDocument(resolved.uri);
      if (seq !== deps.getSeq()) return;

      if (deps.showDocument) {
        await deps.showDocument(doc);
        if (seq !== deps.getSeq()) return;
      }

      if (resolved.mode === 'reused') {
        await deps.remap(resolved.uri.fsPath, problem);
      } else {
        await deps.attach(resolved.uri.fsPath, problem);
      }
      if (seq !== deps.getSeq()) return;

      deps.view.showProblem(problem);
    }
  } catch (err: any) {
    if (err instanceof NoFreeNameError || err?.name === 'NoFreeNameError') {
      deps.notify.showErrorMessage(err.message);
      return;
    }
    throw err;
  }
}

export function handleActiveEditorChange(
  editor?: vscode.TextEditor,
  storeInstance: ProblemStore = store,
  viewInstance: ProblemViewProvider = problemView
): void {
  if (!editor) {
    viewInstance?.clear();
    return;
  }

  // I7: Ignore non-file schemes (untitled, output, git, vscode-userdata)
  if (editor.document.uri.scheme !== 'file') {
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const stat = storeInstance?.getStat(filePath);
  if (stat) {
    viewInstance?.showProblem(stat.payload);
  }
}

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

          vscode.commands.executeCommand('workbench.view.extension.algobridgeContainer');

          let mySeq = 0;
          const deps: TargetDeps = {
            findProblemFile: (b) => findProblemFile(b),
            getStat: (p) => store.getStat(typeof p === 'string' ? p : p.fsPath),
            hasStatFile: (b) => store.hasStatFile(b),
            prompt: async (msg, opts) => {
              return await vscode.window.showInformationMessage(msg, ...opts);
            },
            createFile: async (b) => {
              if (ingestSeq !== mySeq) {
                return null;
              }
              return await createFileWithRetry(
                b,
                createProblemFile,
                (n) => {
                  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                  return (
                    (root ? fs.existsSync(path.join(root, `${n}.cpp`)) : false) ||
                    store.getByBaseName(n) !== undefined
                  );
                }
              );
            },
            fileExists: (b) => {
              const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              return root ? fs.existsSync(path.join(root, `${b}.cpp`)) : false;
            },
            isTaken: (b) => {
              const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              const onDisk = root ? fs.existsSync(path.join(root, `${b}.cpp`)) : false;
              const inStore = store.getByBaseName(b) !== undefined;
              return onDisk || inStore;
            },
          };

          const ingestDeps: IngestDeps = {
            resolveTarget: (p) => resolveTargetFile(p, deps),
            openDocument: (uri) => vscode.workspace.openTextDocument(uri),
            showDocument: (doc) => vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false }),
            attach: (p, prob) => store.attachToFile(p, prob),
            remap: (p, prob) => store.remap(p, prob),
            view: { showProblem: (prob) => problemView.showProblem(prob) },
            notify: { showErrorMessage: (msg) => vscode.window.showErrorMessage(msg) },
            getSeq: () => ingestSeq,
            bumpSeq: () => {
              mySeq = ++ingestSeq;
              return mySeq;
            },
          };

          await runIngest(problem, ingestDeps);

          res.writeHead(200);
          res.end('OK');
        } catch (e: any) {
          if (e instanceof NoFreeNameError) {
            vscode.window.showErrorMessage(e.message);
          } else {
            console.error('Invalid payload or ingest error', e);
          }
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

  if (!activeEditorDisposable) {
    activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      handleActiveEditorChange(editor);
    });
    context.subscriptions.push(activeEditorDisposable);
  }

  handleActiveEditorChange(vscode.window.activeTextEditor);
}

/* ---------------- Deactivation ---------------- */

export async function deactivate(): Promise<void> {
  if (activeEditorDisposable) {
    activeEditorDisposable.dispose();
    activeEditorDisposable = null;
  }
  if (server) {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
    });
    server = null;
  }
}
