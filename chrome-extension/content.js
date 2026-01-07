if (!window.__CF_VIEWER_INITIALIZED__) {
  window.__CF_VIEWER_INITIALIZED__ = true;

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

    function extractLatex(root) {
      const scripts = root.querySelectorAll(
        'script[type="math/tex"], script[type="math/tex; mode=display"]'
      );

      for (const script of scripts) {
        const isBlock = script.type.includes('display');
        const tex = script.textContent.trim();

        const el = document.createElement(isBlock ? 'div' : 'span');
        el.className = 'latex';
        el.textContent = isBlock ? `$$${tex}$$` : `$${tex}$`;

        script.replaceWith(el);
      }

      root
        .querySelectorAll('.MathJax, .MathJax_Display, .MJX_Assistive_MathML')
        .forEach((e) => e.remove());
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

      console.log('STATEMENT HTML:', statementEl.innerHTML);

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
