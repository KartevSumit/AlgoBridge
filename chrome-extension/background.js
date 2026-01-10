const api = typeof browser !== 'undefined' ? browser : chrome;
console.log('[AlgoBridge] background loaded');

api.action.onClicked.addListener((tab) => {
  console.log('[AlgoBridge] background clicked');

  if (!tab.id) return;

  api.tabs
    .sendMessage(tab.id, {
      type: 'EXTRACT_AND_SEND',
    })
    .catch(() => {
      console.warn('[AlgoBridge] content script not available');
    });
});

api.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'SEND_PROBLEM') return;

  fetch('http://localhost:27123/problem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg.payload),
  }).catch(() => {
    console.error('VS Code extension not running');
  });
});
