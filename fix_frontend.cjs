const fs = require('fs');
let content = fs.readFileSync('src/services/geminiService.ts', 'utf8');

content = content.replace(/const res = await fetch\(([^,]+), \{([\s\S]*?)\}\);/g, `const res = await fetch($1, {$2});
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(\`HTTP \${res.status}: \${errText}\`);
    }`);

fs.writeFileSync('src/services/geminiService.ts', content);
