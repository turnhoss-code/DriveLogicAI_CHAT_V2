const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(/const prompt = `You are an automotive diagnostic specialist.[\s\S]*?IMU SENSOR DATA/g, `
      const rpm = data?.rpm || 0;
      const speed = data?.speed || 0;
      const coolantTemp = data?.coolantTemp || 0;
      const load = data?.load || 0;
      const throttlePos = data?.throttlePos || 0;
      const voltage = data?.voltage || 12.0;
      const dtcs = data?.dtcs || [];

      const prompt = \`You are an automotive diagnostic specialist.
      Diagnose vehicles using all data available on the web. Complete request within a 99% accuracy.
      Analyze the following high-fidelity telemetry to provide a diagnostic report with 99% accuracy.
      
      \${vehicleContext}
      OBD-II LIVE DATA:
      - RPM: \${rpm}
      - Speed: \${Math.round(speed * 0.621371)} mph
      - Engine Coolant Temperature: \${Math.round((coolantTemp * 9/5) + 32)} °F
      - Calculated Engine Load: \${load.toFixed(1)}%
      - Throttle Position: \${throttlePos.toFixed(1)}%
      - Battery System Voltage: \${voltage.toFixed(2)}V
      - Active DTCs: \${dtcs.length > 0 ? dtcs.join(', ') : 'None detected'}
      
      IMU SENSOR DATA`);
fs.writeFileSync('server.ts', content);
