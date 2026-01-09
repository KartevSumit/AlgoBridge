const api = typeof browser !== 'undefined' ? browser : chrome;
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  if (!tab.url.includes('codeforces.com/contest')) {
    alert('Open a Codeforces problem page first');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });

    chrome.tabs.sendMessage(tab.id, {
      type: 'EXTRACT_AND_SEND',
    });
  } catch (err) {
    // Script injection failures indicate CSP issues or page reload requirements
    console.error('[AlgoBridge] Content script injection failed', err);
    alert('Failed to inject content script. Reload the page.');
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'SEND_PROBLEM') return;

  fetch('http://localhost:27123/problem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg.payload),
  }).catch(() => {
    alert('VS Code extension not running');
  });
});
