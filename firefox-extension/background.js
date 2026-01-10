browser.browserAction.onClicked.addListener((tab) => {
  browser.tabs
    .sendMessage(tab.id, {
      type: 'EXTRACT_AND_SEND',
    })
    .catch((err) => {
      console.error('[AlgoBridge] sendMessage failed', err);
    });
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'SEND_PROBLEM') return;

  fetch('http://localhost:27123/problem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg.payload),
  }).catch((err) => {
    console.error('[AlgoBridge] fetch failed', err);
  });
});
