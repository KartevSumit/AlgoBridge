import * as vscode from 'vscode';
import * as http from 'http';

/* ---------------- Types ---------------- */

interface ProblemPayload {
  name: string;
  url: string;
  statementHtml: string;
}

/* ---------------- Server ---------------- */

let server: http.Server | null = null;

export function activate(context: vscode.ExtensionContext) {
  server = http.createServer((req, res) => handleRequest(req, res, context));

  const PORT = 27123;

  server.listen(PORT, () => {
    console.log(`CF Viewer listening on http://localhost:${PORT}`);
    vscode.window.showInformationMessage(`CF Viewer running on port ${PORT}`);
  });
}

export function deactivate() {
  server?.close();
}

/* ---------------- HTTP handler ---------------- */

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  context: vscode.ExtensionContext
) {
  if (req.method !== 'POST' || req.url !== '/problem') {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      showProblemWebview(data, context);
      res.writeHead(200);
      res.end('OK');
    } catch (e) {
      console.error(e);
      res.writeHead(400);
      res.end('Invalid payload');
    }
  });
}

/* ---------------- Webview ---------------- */

function showProblemWebview(data: ProblemPayload, context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel('cfProblem', data.name, vscode.ViewColumn.Beside, {
    enableScripts: true,
  });

  const mathjaxUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'mathjax', 'tex-svg.js')
  );

  panel.webview.html = buildHtml(data, mathjaxUri.toString());
}

function buildHtml(data: ProblemPayload, mathjaxSrc: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<script>
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
      displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
    },
    svg: { fontCache: 'global' }
  };
</script>

<script defer src="${mathjaxSrc}"></script>

<style>
  body {
  margin: 0;
  padding: 0;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #252526;
  border-bottom: 1px solid #333;
  padding: 12px 16px;
}

header h1 {
  margin: 0;
  font-size: 18px;
}

header a {
  color: #4ea1ff;
  font-size: 13px;
  text-decoration: none;
}

main {
  padding: 20px 24px;
  max-width: 860px;
  margin: 0 auto;
  line-height: 1.65;
  font-size: 15px;
}

.section-title {
  margin-top: 28px;
  margin-bottom: 8px;
  font-size: 17px;
  font-weight: 600;
  border-bottom: 1px solid #333;
  padding-bottom: 4px;
}

ul, ol {
  margin: 12px 0 12px 24px;
}

li {
  margin: 6px 0;
}

pre {
  background: #252526;
  padding: 12px 14px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: ui-monospace, monospace;
  font-size: 14px;
}

.section-title + p {
  opacity: 0.9;
}


code {
  background: #2a2a2a;
  padding: 2px 6px;
  border-radius: 4px;
}

b, strong {
  font-weight: 500;
}

mjx-container {
  color: #d4d4d4;
}

mjx-container[jax="SVG"][display="true"] {
  margin: 14px 0;
}

header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #252526;
  border-bottom: 1px solid #333;
  padding: 12px 16px;
}

.title-link {
  font-size: 18px;
  font-weight: 600;
  color: #d4d4d4;
  text-decoration: none;
}

.title-link:hover {
  text-decoration: underline;
  color: #4ea1ff;
}


</style>
</head>
<body>
  <header>
    <a class="title-link" href="${data.url}">
      ${data.name}
    </a>
  </header>

  <main>
    ${data.statementHtml}
  </main>

</body>
</html>
`;
}
