(function () {
  function extractProblem() {
    const titleEl = document.querySelector('.problem-statement .title');
    const statementEl = document.querySelector('.problem-statement');

    if (!titleEl || !statementEl) return null;

    const name = titleEl.textContent.trim();
    const url = window.location.href;

    // Clone statement to avoid modifying page
    const statementClone = statementEl.cloneNode(true);

    // Remove title from body (we show it separately)
    const titleNode = statementClone.querySelector('.title');
    if (titleNode) titleNode.remove();

    const statementHtml = statementClone.innerHTML;

    // Extract samples
    const samples = [];
    const inputBlocks = statementEl.querySelectorAll('.sample-test .input pre');
    const outputBlocks = statementEl.querySelectorAll('.sample-test .output pre');

    for (let i = 0; i < Math.min(inputBlocks.length, outputBlocks.length); i++) {
      samples.push({
        input: inputBlocks[i].innerText.trim() + '\n',
        output: outputBlocks[i].innerText.trim() + '\n',
      });
    }

    return {
      name,
      url,
      statementHtml,
      samples,
    };
  }

  // Add keyboard shortcut: Ctrl + Shift + S
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
      const data = extractProblem();
      if (!data) {
        alert('Could not extract problem');
        return;
      }

      chrome.runtime.sendMessage({
        type: 'SEND_PROBLEM',
        payload: data,
      });
    }
  });
})();
