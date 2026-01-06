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

export function activate(context: vscode.ExtensionContext) {
  console.log('CF VIEWER EXTENSION ACTIVATED');

  store = new ProblemStore(context);
  problemView = new ProblemViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cfBridge.problemView', problemView)
  );

  /* ---------- HTTP server ---------- */

  server = http.createServer(async (req, res) => {
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

        // 🔑 Ensure sidebar + view are visible (lazy-loading fix)
        vscode.commands.executeCommand('workbench.view.extension.cfBridgeContainer');

        // 1️⃣ Try to find an existing file
        let file = await findProblemFile(base);

        // 2️⃣ Create file if missing
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

        // 3️⃣ Attach + show
        if (file) {
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

  server.listen(27123, '127.0.0.1', () => {
    console.log('CF VIEWER SERVER LISTENING ON 27123');
  });

  /* ---------- Editor change handling ---------- */

  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor) {
      problemView.clear();
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const base = path.basename(filePath).replace(/\.\w+$/, '');

    const problem = store.getForFile(filePath) || store.getByBaseName(base);

    if (problem) {
      problemView.showProblem(problem);
    } else {
      problemView.clear();
    }
  });

  syncWithEditor(vscode.window.activeTextEditor);
}

function syncWithEditor(editor?: vscode.TextEditor) {
  if (!editor) {
    problemView.clear();
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const base = path.basename(filePath).replace(/\.\w+$/, '');

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
