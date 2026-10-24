const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(
  /console\.error\("Auth action failed", error\);/g,
  'console.warn("Auth action failed", error);'
);
app = app.replace(
  /console\.error\("Login failed", error\);/g,
  'console.warn("Login failed", error);'
);
fs.writeFileSync('src/App.tsx', app);
