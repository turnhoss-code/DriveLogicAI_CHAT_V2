const fs = require('fs');

let gemini = fs.readFileSync('src/services/geminiService.ts', 'utf8');
gemini = gemini.replace(/console\.error\(/g, 'console.warn(');
fs.writeFileSync('src/services/geminiService.ts', gemini);

let firestore = fs.readFileSync('src/lib/firestore.ts', 'utf8');
firestore = firestore.replace(/console\.error\(/g, 'console.warn(');
fs.writeFileSync('src/lib/firestore.ts', firestore);

