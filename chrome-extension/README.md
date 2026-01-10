# AlgoBridge Web Extension (Chrome)

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

- **Instant Visibility**: One click in your browser sends the problem statement to VS Code.
- **Clean Math Rendering**: Supports LaTeX math and formatted constraints.
- **Auto-Syncing**: Updates the problem view when you switch problems.
- **Workspace Integration**: Can automatically create solution files in VS Code.
- **Privacy First**: Everything runs locally. Communication happens over `localhost:27123`.

## How it works

<p align="center">
  <img src="https://raw.githubusercontent.com/KartevSumit/AlgoBridge/main/vscode-extension/algobridge/images/diagram.png" width="225" alt="Dataflow Diagram">
</p>

## Requirements

To use AlgoBridge, you must install **both**:
1. The **AlgoBridge VS Code Extension**
2. The **AlgoBridge Chrome Browser Extension**

The Chrome extension extracts the problem statement from supported websites and sends it to VS Code.

---

## Chrome Extension Installation (Manual)

The Chrome version of AlgoBridge is **not published on the Chrome Web Store** and must be installed manually.

### Steps

1. Download the Chrome extension source from: https://github.com/KartevSumit/AlgoBridge/tree/main/chrome-extension

2. Open Chrome and navigate to: chrome://extensions

3. Enable **Developer mode** (top-right corner)

4. Click **Load unpacked**

5. Select the `chrome-extension` directory

The AlgoBridge icon will now appear in the Chrome toolbar.

---

## VS Code Extension Installation

1. Install **AlgoBridge** from the VS Code Marketplace.
2. Open a folder or workspace in VS Code.
3. The extension will automatically start a local server on port `27123`.

---

## Supported Platforms

- **Codeforces** ✓  
- More platforms (LeetCode, AtCoder) coming soon.

---

## Privacy

- No data leaves your machine.
- No analytics or tracking.
- Communication happens strictly over your local network.

---

Built for competitive programmers who want to stay in their editor.
