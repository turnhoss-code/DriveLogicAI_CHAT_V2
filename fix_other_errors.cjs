const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(
  /console\.error\(/g,
  'console.warn('
);
fs.writeFileSync('src/App.tsx', app);
