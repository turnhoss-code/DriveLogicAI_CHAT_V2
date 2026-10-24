const fs = require('fs');

let chat = fs.readFileSync('src/components/ChatAssistant.tsx', 'utf8');
chat = chat.replace(
  /console\.error\("Failed to start speech recognition:", e\);/g,
  'console.warn("Failed to start speech recognition:", e?.message || e);'
);
fs.writeFileSync('src/components/ChatAssistant.tsx', chat);
