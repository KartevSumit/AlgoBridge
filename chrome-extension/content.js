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
      root.querySelectorAll('script[type^="math/tex"]').forEach((script) => {
        let tex = script.textContent || '';
        const isDisplay = script.type.includes('mode=display');

        tex = tex.replace(/\$\\text\{\(\}\$/g, '(').replace(/\$\\text\{\)\}\$/g, ')');

        // Handle spaces inside the math block
        if (tex.includes(' ') && !tex.includes('\\')) {
          tex = tex.replace(/ /g, '\\ ');
        }

        const delimiter = isDisplay ? '$$' : '$';
        const latexNode = document.createTextNode(`${delimiter}${tex}${delimiter}`);
        script.parentNode.replaceChild(latexNode, script);
      });

      // Cleanup visual artifacts
      root.querySelectorAll('.MathJax_Display, .MJX_Assistive_MathML').forEach((el) => el.remove());
    }

    function extractProblem() {
      const titleEl = document.querySelector('.problem-statement .title');
      const statementEl = document.querySelector('.problem-statement');
      if (!titleEl || !statementEl) return null;

      const clone = statementEl.cloneNode(true);
      clone.querySelector('.title')?.remove();

      cleanStatement(clone);

      let html = clone.innerHTML;
      html = html.replace(/\(/g, '$\\text{(}$').replace(/\)/g, '$\\text{)}$');
      clone.innerHTML = html;

      extractLatex(clone);

      return {
        name: titleEl.textContent.trim(),
        url: location.href,
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
