if (!window.__CF_VIEWER_INITIALIZED__) {
  window.__CF_VIEWER_INITIALIZED__ = true;

  (function () {
    function cleanStatement(root) {
      root
        .querySelectorAll('.time-limit, .memory-limit, .input-file, .output-file')
        .forEach((el) => el.remove());

      root.querySelectorAll('math').forEach((el) => el.remove());
      root.querySelectorAll('nobr[aria-hidden="true"]').forEach((el) => el.remove());

      root.querySelectorAll('script[type="math/tex"]').forEach((script) => {
        const tex = script.textContent || '';
        const span = document.createElement('span');
        span.textContent = `\\(${tex}\\)`;
        script.replaceWith(span);
      });

      root.querySelectorAll('*').forEach((el) => {
        if (el.textContent?.trim() === 'Copy') el.remove();
      });
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
