# AlgoBridge for VS Code

Bring competitive programming problems directly into your editor. No more switching tabs to read statements or copy constraints.

## Why?

Context switching between browser and editor is annoying and slow. You lose focus, miss constraints, and waste time scrolling back and forth.

On platforms where the problem statement stays visible while you code, the workflow is faster and more reliable. AlgoBridge brings that experience to VS Code, allowing you to reference constraints instantly and catch edge cases as you write.

## Preview

![Statement](https://raw.githubusercontent.com/KartevSumit/AlgoBridge/main/vscode-extension/algobridge/images/screenshot1.png)
_Problem statement_

![Sample Input and Output](https://raw.githubusercontent.com/KartevSumit/AlgoBridge/main/vscode-extension/algobridge/images/screenshot2.png)
_Sample Input and Output_

![Diagrams and Notes](https://raw.githubusercontent.com/KartevSumit/AlgoBridge/main/vscode-extension/algobridge/images/screenshot3.png)
_Diagrams and Notes_

## Features

- **Instant Visibility**: One click in your browser brings the problem statement directly into a sidebar view.
- **Clean Math Rendering**: Uses KaTeX to render LaTeX expressions with high-performance formatting.
- **Auto-Syncing**: Automatically updates the problem view when you switch between active editor tabs.
- **Workspace Integration**: Offers to automatically create solution files with a C++ template when a new problem is received.
- **Privacy First**: Everything runs locally. Your browser talks directly to your editor over port **27123**.

## How it works

<p align="center">
  <img src="https://raw.githubusercontent.com/KartevSumit/AlgoBridge/main/vscode-extension/algobridge/images/diagram.png" width="225" alt="Dataflow Diagram">
</p>

## Requirements

To use this extension, you must also install the **AlgoBridge Browser Extension** to extract problem data from web pages.

- **Firefox**: Available on Firefox Add-ons.
- **Chrome**: The Chrome web extension must be installed manually from GitHub.

## Browser Extension Installation

### Firefox

Install the AlgoBridge browser extension from the Firefox Add-ons store.

### Chrome (Manual Installation)

The Chrome version of the browser extension is not published on the Chrome Web Store and must be installed manually:

1. Download the extension from:
   https://github.com/KartevSumit/AlgoBridge/tree/main/chrome-extension
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked**
5. Select the `chrome-extension` directory

After installation, you can use the extension normally.

## Installation

1. Install this extension from the VS Code Marketplace.
2. Open a folder or workspace in VS Code.
3. The extension will start its local server on port `27123` automatically.

## Supported Platforms

- **Codeforces** ✓
- More platforms (LeetCode, AtCoder) coming soon.

## Privacy

- No data leaves your machine.
- No analytics or tracking.
- Communication happens strictly over your local network.

---

Built for competitive programmers who want to stay in their editor.
