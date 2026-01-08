// Guard against multiple injections on the same page
if (!window.__ALGOBRIDGE_INITIALIZED__) {
  window.__ALGOBRIDGE_INITIALIZED__ = true;

  (function () {
    function cleanStatement(root) {
      root
        .querySelectorAll('.time-limit, .memory-limit, .input-file, .output-file')
        .forEach((el) => el.remove());

      root.querySelectorAll('nobr[aria-hidden="true"]').forEach((el) => el.remove());

      root.querySelectorAll('*').forEach((el) => {
        if (el.textContent?.trim() === 'Copy') el.remove();
      });
    }

    // Convert MathJax script tags into raw LaTeX
    function extractLatex(root) {
      root.querySelectorAll('script[type="math/tex"]').forEach((script) => {
        const tex = script.textContent?.trim() ?? '';
        script.replaceWith(document.createTextNode(`$${tex}$`));
      });

      root.querySelectorAll('script[type="math/tex; mode=display"]').forEach((script) => {
        const tex = script.textContent?.trim() ?? '';
        script.replaceWith(document.createTextNode(`$$${tex}$$`));
      });

      root
        .querySelectorAll('.MathJax, .MathJax_Display, .MJX_Assistive_MathML')
        .forEach((el) => el.remove());
    }

    function extractProblem() {
      const titleEl = document.querySelector('.problem-statement .title');
      const statementEl = document.querySelector('.problem-statement');
      if (!titleEl || !statementEl) return null;

      const name = titleEl.textContent.trim();
      const url = location.href;

      const clone = statementEl.cloneNode(true);
      clone.querySelector('.title')?.remove();
      cleanStatement(clone);

      if (clone instanceof Element) {
        extractLatex(clone);
      }

      return {
        name,
        url,
        statementHtml: clone.innerHTML,
      };
    }

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type !== 'EXTRACT_AND_SEND') return;

      const payload = extractProblem();
      if (!payload) return;

      chrome.runtime.sendMessage({
        type: 'SEND_PROBLEM',
        payload,
      });
    });
  })();
}
