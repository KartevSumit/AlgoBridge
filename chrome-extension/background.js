chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== 'SEND_PROBLEM') return;

  fetch('http://localhost:27123/problem', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message.payload)
  })
    .then(() => {
      console.log('Problem sent to VS Code');
    })
    .catch((err) => {
      console.error('Failed to send problem:', err);
      alert('Could not connect to VS Code. Is the extension running?');
    });
});
