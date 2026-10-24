const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(
  /console\.error\(error\);/g,
  'console.warn(error);'
);
fs.writeFileSync('src/App.tsx', app);
