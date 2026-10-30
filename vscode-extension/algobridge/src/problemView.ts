import * as vscode from 'vscode';
import {
  sanitizeStatementHtml,
  buildCsp,
  generateNonce,
  escapeHtml,
} from './sanitize';

export { sanitizeStatementHtml, buildCsp, generateNonce, escapeHtml };

export interface ProblemPayload {
  name: string;
  url: string;
  statementHtml: string;
  platform?: string;
  contestId?: string;
  index?: string;
}

export class ProblemViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private currentProblem: ProblemPayload | null = null;
  private isLoadingProblem = false;

  constructor(private context: vscode.ExtensionContext) {}

  public async focus() {
    if (!this.view) {
      await vscode.commands.executeCommand('algobridge.problemView.focus');
    } else {
      this.view.show?.(true);
    }
  }

  private emptyHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<body style="
    background: var(--vscode-editor-background);
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family);
    padding: 12px;
  ">
  <h1>No Statement linked to this file.</h1>
  <p>Use Web Extension to bring Statement to your code editor</p>
</body>
</html>
`;
  }

  clear() {
    this.isLoadingProblem = false;
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

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    view.webview.html = this.emptyHtml();

    if (this.currentProblem) {
      this.showProblem(this.currentProblem);
    }
  }

  showProblem(problem: ProblemPayload) {
    const isNewProblem = this.currentProblem?.url !== problem.url;

    this.currentProblem = problem;
    this.isLoadingProblem = true;
    this.focus();

    if (this.view && (isNewProblem || this.view.webview.html === this.emptyHtml())) {
      this.render();
    }
  }

  private loadingHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
</head>
<body style="
  background: var(--vscode-editor-background);
  color: var(--vscode-descriptionForeground);
  font-family: var(--vscode-font-family);
  padding: 12px;
">
  <div class="skeleton title"></div>
  <div class="skeleton line"></div>
  <div class="skeleton line"></div>
  <div class="skeleton line short"></div>

  <style>
    .skeleton {
      background: linear-gradient(
        90deg,
        var(--vscode-editor-background),
        var(--vscode-editorGroup-border),
        var(--vscode-editor-background)
      );
      background-size: 200% 100%;
      animation: shimmer 1.2s infinite;
      border-radius: 4px;
      margin-bottom: 8px;
      height: 14px;
    }
    .skeleton.title { height: 20px; width: 60%; }
    .skeleton.short { width: 40%; }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  </style>
</body>
</html>
`;
  }

  private fallbackHtml(cspSource: string, title: string, message: string): string {
    let csp = `default-src 'none'; base-uri 'none'; style-src ${cspSource} 'unsafe-inline';`;
    try {
      const nonce = generateNonce();
      csp = buildCsp(cspSource, nonce);
    } catch {
      csp = `default-src 'none'; base-uri 'none'; script-src 'none';`;
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
body {
  margin: 0;
  padding: 16px;
  background: var(--vscode-sideBar-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
}
h2 {
  font-size: 16px;
  color: var(--vscode-errorForeground, var(--vscode-editor-foreground));
}
p {
  color: var(--vscode-descriptionForeground);
}
</style>
</head>
<body>
  <h2>${escapeHtml(title)}</h2>
  <p>${escapeHtml(message)}</p>
</body>
</html>`;
  }

  private render() {
    if (!this.view || !this.currentProblem) return;

    const webview = this.view.webview;

    const katexCss = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'katex', 'katex.min.css')
    );

    const katexJs = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'katex', 'katex.min.js')
    );

    const katexAutoRenderJs = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'katex',
        'contrib',
        'auto-render.min.js'
      )
    );

    const html = this.buildHtml(
      this.currentProblem,
      webview,
      {
        katexCss: katexCss.toString(),
        katexJs: katexJs.toString(),
        katexAutoRenderJs: katexAutoRenderJs.toString(),
      }
    );

    webview.html = html;
    this.isLoadingProblem = false;
  }

  buildHtml(
    problem: ProblemPayload | null | undefined,
    webviewOrAssets: { cspSource: string } | { katexCss: string; katexJs: string; katexAutoRenderJs: string },
    maybeAssets?: { katexCss: string; katexJs: string; katexAutoRenderJs: string }
  ): string {
    let cspSource = 'vscode-webview:';
    let assets = { katexCss: '', katexJs: '', katexAutoRenderJs: '' };

    if (maybeAssets) {
      cspSource = (webviewOrAssets as { cspSource: string }).cspSource;
      assets = maybeAssets;
    } else if ('cspSource' in webviewOrAssets) {
      cspSource = webviewOrAssets.cspSource;
    } else {
      assets = webviewOrAssets;
    }

    if (!problem) {
      return this.fallbackHtml(cspSource, 'No Problem', 'No problem is currently selected.');
    }

    let nonce: string;
    let safeStatement: string;
    let csp: string;

    try {
      nonce = generateNonce();
      safeStatement = sanitizeStatementHtml(problem.statementHtml);
      if (!safeStatement) {
        safeStatement = '<p>No statement available</p>';
      }
      csp = buildCsp(cspSource, nonce);
    } catch (err) {
      return this.fallbackHtml(cspSource, 'Rendering Error', 'Failed to render problem statement safely.');
    }

    const safeTitle = escapeHtml(problem.name || 'Untitled Problem');
    const safeUrl = escapeHtml(problem.url || '#');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${escapeHtml(assets.katexCss)}">

<script nonce="${nonce}" src="${escapeHtml(assets.katexJs)}"></script>
<script nonce="${nonce}" src="${escapeHtml(assets.katexAutoRenderJs)}"></script>
<script nonce="${nonce}">
  document.addEventListener("DOMContentLoaded", () => {
    try {
      if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.getElementById("content"), {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
          ],
          throwOnError: false
        });
      }
    } catch (e) {
      console.error("KaTeX render failed", e);
    }

    const loading = document.getElementById("loading");
    if (loading) loading.remove();
    const content = document.getElementById("content");
    if (content) content.style.display = "block";

    function updateHighlight(target, add) {
      while (target && target !== document) {
        if (target.classList && target.classList.contains('test-example-line')) {
          for (const cls of target.classList) {
            if (cls.startsWith('test-example-line-')) {
              const suffix = cls.substring('test-example-line-'.length);
              if (suffix !== 'even' && suffix !== 'odd' && suffix !== '0') {
                const partners = document.getElementsByClassName(cls);
                for (let i = 0; i < partners.length; i++) {
                  if (add) {
                    partners[i].classList.add('test-case-hover');
                  } else {
                    partners[i].classList.remove('test-case-hover');
                  }
                }
              }
            }
          }
          return;
        }
        target = target.parentElement;
      }
    }

    document.addEventListener('mouseover', (e) => updateHighlight(e.target, true));
    document.addEventListener('mouseout', (e) => updateHighlight(e.target, false));
  });
</script>

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
  font-size: 14px;
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
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  padding: 6px 10px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.problemName {
  font-weight: 600;
  font-size: 14px;
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
  font-size: 13.5px;
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
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

p {
  margin: 10px 0px;
}

ul, ol {
  margin: 6px 0;
}

li {
  margin: 6px 0;
}

b, strong {
  font-weight: 700;
}

a {
  color: var(--link);
  transition: color 0.15s ease;
}

/* ---------- Code ---------- */
pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  padding: 8px 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
}

pre:hover {
  background: var(--code-bg);
  background: color-mix(in srgb, var(--code-bg) 85%, transparent);
}

code {
  background: var(--code-bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
}

/* ---------- KateX ---------- */
.katex {
  font-size: 1.12em;
  text-rendering: optimizeLegibility;
}

.katex-inline {
  vertical-align: -0.1em;
}

.katex-display:hover > .katex {
  font-size: 1.3em;
}

.katex-display {
  margin: 1em 0;
  padding: 0.4em 0.6em;
  overflow-x: auto;
  overflow-y: visible;
  background: var(--code-bg);
  background: color-mix(in srgb, var(--code-bg) 92%, transparent);
  border-radius: 6px;
}

.katex-display > .katex {
  font-size: 1.2em;
}

.katex .mspace {
  min-width: 0.15em;
}

.katex .op-symbol {
  font-weight: 500;
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

@media (max-width: 700px) {
  .sample-test {
    grid-template-columns: 1fr;
  }
}

.sample-test .input,
.sample-test .output {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 6px;
  overflow: hidden;
}

.sample-test .input {
  background: var(--code-bg);
  background: color-mix(in srgb, var(--code-bg) 92%, transparent);
}

.sample-test .output {
  background: var(--code-bg);
  background: color-mix(in srgb, var(--code-bg) 88%, transparent);
}

.sample-test .title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.sample-test pre {
  margin: 0;
  padding: 3px 3px;
  background: transparent;
  border: none;
  font-size: 14px;
  line-height: 1.45;
}

.sample-test pre div {
  display: block;
}

/* ---------- Loading ---------- */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--vscode-editor-background),
    var(--vscode-editorGroup-border),
    var(--vscode-editor-background)
  );
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  border-radius: 4px;
  margin-bottom: 8px;
  height: 14px;
}

.skeleton.title { height: 20px; width: 60%; }
.skeleton.short { width: 40%; }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ---------- Alternating Test Case Rows ---------- */
.test-example-line-even {
  background-color: var(--code-bg);
  background-color: color-mix(in srgb, var(--fg) 8%, transparent);
  margin: 0;
  padding: 0 7px;
  padding-top: 0.4px;
}

.test-example-line-odd {
  background-color: transparent;
  background-color: color-mix(in srgb, var(--fg) 1%, transparent);
  margin: 0;
  padding: 0 7px;
  padding-top: 0.4px;
}

.test-case-hover {
  background-color: var(--vscode-editor-hoverHighlightBackground) !important;
  cursor: pointer;
}

/* ---------- High Contrast Mode ---------- */
body.vscode-high-contrast .test-example-line-even,
body.vscode-high-contrast .test-example-line-odd,
body.vscode-high-contrast-light .test-example-line-even,
body.vscode-high-contrast-light .test-example-line-odd {
  background-color: transparent !important;
  border-bottom: 1px solid var(--vscode-contrastBorder, var(--vscode-editorGroup-border));
}

</style>
</head>

<body>
  <header class="heading">
    <a class="problemName" href="${safeUrl}">
      ${safeTitle}
    </a>
  </header>

  <div id="loading">
    <div class="skeleton title"></div>
    <div class="skeleton line"></div>
    <div class="skeleton line"></div>
    <div class="skeleton line short"></div>
  </div>

  <main>
    <div id="content" style="display:none">
      ${safeStatement}
    </div>
  </main>
</body>

</html>`;
  }
}
