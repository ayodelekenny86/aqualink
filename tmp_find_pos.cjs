const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');

// Find what line position 14802 is on
let lineNum = 1;
for (let i = 0; i < c.length; i++) {
  if (i === 14802) {
    const lineStart = c.lastIndexOf('\n', i) + 1;
    const lineEnd = c.indexOf('\n', i);
    const lineContent = c.substring(lineStart, lineEnd);
    console.log('Position 14802 is on line', lineNum);
    console.log('Line length:', lineContent.length);
    console.log('First 200 chars:', lineContent.substring(0, 200));
    break;
  }
  if (c[i] === '\n') {
    lineNum++;
  }
}

// Also check for the topbar
const topbarIdx = c.indexOf('header className="topbar"');
const topbarLineStart = c.lastIndexOf('\n', topbarIdx) + 1;
console.log('\nTopbar starts at char position:', topbarIdx);
console.log('Topbar line number:', c.substring(0, topbarIdx).split('\n').length);

// Check if the sign-out button area is around position 14802
const signOutIdx = c.indexOf('canSignOut');
console.log('\ncanSignOut first found at:', signOutIdx, 'line:', c.substring(0, signOutIdx).split('\n').length);
const signOutUsageIdx = c.indexOf('canSignOut', signOutIdx + 1);
console.log('canSignOut usage found at:', signOutUsageIdx, 'line:', c.substring(0, signOutUsageIdx).split('\n').length);
