import * as vscode from 'vscode';
import * as http from 'http';

/* ---------------- Types ---------------- */

interface ProblemPayload {
  name: string; // "E. Mexification"
  url: string; // CF problem URL
  statementHtml: string; // Full HTML statement
  samples: {
    input: string;
    output: string;
  }[];
}

/* ---------------- Extension lifecycle ---------------- */

let server: http.Server | null = null;

export function activate() {
  server = http.createServer(handleRequest);

  const PORT = 27123; // fixed port (simple + reliable)

  server.listen(PORT, () => {
    console.log(`CF Viewer listening on http://localhost:${PORT}`);
    vscode.window.showInformationMessage(`CF Viewer running on port ${PORT}`);
  });
}

export function deactivate() {
  if (server) {
    server.close();
    server = null;
  }
}

/* ---------------- HTTP handler ---------------- */

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method !== 'POST' || req.url !== '/problem') {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';

  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    try {
      const data: ProblemPayload = JSON.parse(body);
      showProblemWebview(data);

      res.writeHead(200);
      res.end('OK');
    } catch (err) {
      console.error(err);
      res.writeHead(400);
      res.end('Invalid payload');
    }
  });
}

/* ---------------- Webview ---------------- */

function showProblemWebview(data: ProblemPayload) {
  const panel = vscode.window.createWebviewPanel('cfProblem', data.name, vscode.ViewColumn.Beside, {
    enableScripts: false,
  });

  panel.webview.html = buildHtml(data);
}

function buildHtml(data: ProblemPayload): string {
  const samplesHtml = data.samples
    .map(
      (s, i) => `
        <h3>Sample ${i + 1}</h3>
        <pre><b>Input</b>\n${escapeHtml(s.input)}</pre>
        <pre><b>Output</b>\n${escapeHtml(s.output)}</pre>
      `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: system-ui, sans-serif;
      padding: 16px;
      background-color: #1e1e1e;
      color: #ddd;
    }
    h1, h2, h3 {
      color: #fff;
    }
    pre {
      background: #2d2d2d;
      padding: 12px;
      overflow-x: auto;
      border-radius: 6px;
    }
    a {
      color: #4ea1ff;
      text-decoration: none;
    }
    hr {
      border: 0;
      border-top: 1px solid #444;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>${data.name}</h1>
  <a href="${data.url}">Open on Codeforces</a>
  <hr />
  ${data.statementHtml}
  <hr />
  ${samplesHtml}
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
