import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';

import { ProblemViewProvider, ProblemPayload } from './problemView';
import { ProblemStore } from './problemStore';

import { problemNameToFilePrefix } from './problemNameToBase';
import { findProblemFile } from './findProblemFile';
import { createProblemFile } from './createProblemFile';

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'POST' || req.url !== '/problem') {
      res.writeHead(404);
      res.end();
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
  });

  server.listen(27123, '127.0.0.1');
  server.on('error', (err: any) => {
    vscode.window.showErrorMessage(`AlgoBridge server failed: ${err.message}`);
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
