const fs = require('fs');

let gps = fs.readFileSync('src/components/GPSTab.tsx', 'utf8');
gps = gps.replace(/console\.error\(/g, 'console.warn(');
fs.writeFileSync('src/components/GPSTab.tsx', gps);

let obd = fs.readFileSync('src/components/OBDTab.tsx', 'utf8');
obd = obd.replace(/console\.error\(/g, 'console.warn(');
fs.writeFileSync('src/components/OBDTab.tsx', obd);

