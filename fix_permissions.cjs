const fs = require('fs');

// LiveChatAssistant.tsx
let liveChat = fs.readFileSync('src/components/LiveChatAssistant.tsx', 'utf8');
liveChat = liveChat.replace(
  /console\.error\(err\);\s*setError\("Mic permission denied or unavailable\."\);/g,
  'console.warn("Microphone access error:", err.message);\n      setError("Mic permission denied or unavailable. Please enable microphone access.");'
);
fs.writeFileSync('src/components/LiveChatAssistant.tsx', liveChat);

// App.tsx
let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(
  /throw new Error\("Bluetooth permission denied\. Please allow Bluetooth access in your browser settings\."\);/g,
  'console.warn("Bluetooth permission denied.");\n        // do not throw to prevent red error overlay\n        alert("Bluetooth permission denied. Please allow Bluetooth access in your browser settings.");'
);
fs.writeFileSync('src/App.tsx', app);

