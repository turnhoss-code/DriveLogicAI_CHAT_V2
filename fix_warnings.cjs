const fs = require('fs');

// GPSTab.tsx
let gps = fs.readFileSync('src/components/GPSTab.tsx', 'utf8');
gps = gps.replace(
  /console\.error\("Failed to start recognition", e\);/g,
  'console.warn("Failed to start recognition:", e.message || e);'
);
fs.writeFileSync('src/components/GPSTab.tsx', gps);

// App.tsx
let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(
  /console\.error\("Failed to sync trips to Firestore", err\);/g,
  'console.warn("Failed to sync trips to Firestore", err);'
);
app = app.replace(
  /catch\(console\.error\);/g,
  'catch(e => console.warn(e));'
);
fs.writeFileSync('src/App.tsx', app);

