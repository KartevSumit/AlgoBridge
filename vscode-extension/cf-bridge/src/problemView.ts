import * as vscode from 'vscode';

export interface ProblemPayload {
  name: string;
  url: string;
  statementHtml: string;
}

export class ProblemViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private currentProblem: ProblemPayload | null = null;

  constructor(private context: vscode.ExtensionContext) {}

  public async focus() {
    if (!this.view) {
      // Force VS Code to call resolveWebviewView
      await vscode.commands.executeCommand('cfBridge.problemView.focus');
    } else {
      this.view.show?.(true);
    }
  }

  private emptyHtml(): string {
    return `
<!DOCTYPE html>
<html>
<body style="
    background: var(--vscode-editor-background);
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family);
    padding: 12px;
  ">
  <h1>No Statement linked to this file.</h1>
</body>
</html>
`;
  }

  clear() {
    this.currentProblem = null;

    if (!this.view) return;

    this.view.webview.html = this.emptyHtml();
  }

  resolveWebviewView(
    view: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = view;

    view.webview.options = { enableScripts: true };

    view.webview.html = this.emptyHtml();

    if (this.currentProblem) {
      this.showProblem(this.currentProblem);
    }
  }

  showProblem(problem: ProblemPayload) {
    this.currentProblem = problem;
    this.focus();
    if (this.view) {
      this.render();
    }
  }

  private render() {
    if (!this.view || !this.currentProblem) return;
    const mathjaxUri = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mathjax', 'tex-svg.js')
    );
    this.view.webview.html = this.buildHtml(this.currentProblem, mathjaxUri.toString());
  }

  private buildHtml(problem: ProblemPayload, mathjaxSrc: string): string {
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

<script>
  document.addEventListener('DOMContentLoaded', function() {
    function normalizePre(pre) {
      return Array.from(pre.children)
        .map(div => div.textContent)
        .join('\n')
        .trim();
    }

    document.querySelectorAll('.sample-test .input, .sample-test .output')
      .forEach(block => {
        const title = block.querySelector('.title');
        const pre = block.querySelector('pre');
        if (!title || !pre) return;

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';

        btn.onclick = () => {
          navigator.clipboard.writeText(normalizePre(pre));
          btn.textContent = 'Copied';
          setTimeout(() => btn.textContent = 'Copy', 800);
        };

        title.appendChild(btn);
      });
  });
</script>

<script defer src="${mathjaxSrc}"></script>

<style>
/* ---------- Theme Variables ---------- */
:root {
  --bg: var(--vscode-sideBar-background);
  --fg: var(--vscode-editor-foreground);
  --muted: var(--vscode-descriptionForeground);
  --border: var(--vscode-editorGroup-border);
  --link: var(--vscode-textLink-foreground);
  --link-hover: var(--vscode-textLink-activeForeground);
  --code-bg: var(--vscode-textBlockQuote-background);
  --header-height: 36px;
}

/* ---------- Base ---------- */
body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--vscode-font-family);
  font-size: 13px;
  line-height: 1.6;
}

/* ---------- Header ---------- */
.heading {
  position: sticky;
  top: 0;
  z-index: 10;
  height: 36px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 6px 10px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.problemName {
  font-weight: 600;
  font-size: 13px;
  color: var(--link);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.problemName:hover {
  color: var(--link-hover);
  text-decoration: underline;
  }

.section-title {
  margin: 14px 0 6px;
  padding-bottom: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--vscode-editor-foreground);
  border-bottom: 1px solid var(--border);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
  
/* ---------- Content ---------- */
main {
  padding: 10px 12px 12px;
  max-width: 900px;
  margin: 0 auto;
}

/* ---------- Text ---------- */
p {
  margin: 6px 0;
}

ul, ol {
  padding-left: 18px;
  margin: 6px 0;
}

li {
  margin: 4px 0;
}

b, strong {
  font-weight: 600;
}

/* ---------- Code ---------- */
pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  padding: 8px 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
}

code {
  background: var(--code-bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
}

/* ---------- Math ---------- */
mjx-container {
  color: var(--fg);
}

mjx-container[jax="SVG"][display="true"] {
  margin: 8px 0;
}

/* ---------- Sample Tests ---------- */

.sample-tests {
  margin-top: 18px;
}

.sample-test {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 10px;
}

/* Stack on narrow panels */
@media (max-width: 700px) {
  .sample-test {
    grid-template-columns: 1fr;
  }
}

.sample-test .input,
.sample-test .output {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.sample-test .title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.sample-test pre {
  margin: 0;
  padding: 8px 10px;
  background: transparent;
  border: none;
  font-size: 12px;
  line-height: 1.45;
}

/* Remove CF line wrappers */
.sample-test pre div {
  display: block;
}

/* ---------- Sample Tests ---------- */

.sample-tests {
  margin-top: 18px;
}

.sample-test {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 10px;
}

/* Stack on narrow panels */
@media (max-width: 700px) {
  .sample-test {
    grid-template-columns: 1fr;
  }
}

.sample-test .input,
.sample-test .output {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.sample-test .title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.sample-test pre {
  margin: 0;
  padding: 8px 10px;
  background: transparent;
  border: none;
  font-size: 12px;
  line-height: 1.45;
}

/* Remove CF line wrappers */
.sample-test pre div {
  display: block;
}

/* ---------- Copy Button ---------- */
.copy-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 3px;
  cursor: pointer;
  font-family: var(--vscode-font-family);
}

.copy-btn:hover {
  background: var(--vscode-button-hoverBackground);
}

.copy-btn:active {
  opacity: 0.8;
}

</style>
</head>

<body>
  <header class="heading">
  <a class="problemName" href="${problem.url}">
    ${problem.name}
  </a>
</header>

  <main>
    ${problem.statementHtml}
  </main>
</body>
</html>
`;
  }
}
