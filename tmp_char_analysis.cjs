const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');

// Show detailed view around the error position
const start = 14780;
const end = 14900;
console.log('=== Characters around error position (14802-14849) ===');
for (let i = start; i < end; i++) {
  const ch = c[i];
  const code = ch.charCodeAt(0);
  if (code > 127) {
    console.log(`Pos ${i}: U+${code.toString(16).toUpperCase().padStart(4, '0')} = ${ch}`);
  }
}

console.log('\n=== Full context string (14790-14860) ===');
const context = c.substring(14790, 14860);
console.log(JSON.stringify(context));

// Also check for any unusual characters in the first 5000 chars
console.log('\n=== Non-ASCII characters in first 15000 chars ===');
for (let i = 0; i < Math.min(15000, c.length); i++) {
  const ch = c[i];
  const code = ch.charCodeAt(0);
  if (code > 127) {
    console.log(`Pos ${i}: U+${code.toString(16).toUpperCase().padStart(4, '0')} = ${ch}`);
    if (i > 0) {
      console.log(`  Preceding: ${JSON.stringify(c.substring(Math.max(0, i-10), i))}`);
      console.log(`  Following: ${JSON.stringify(c.substring(i, Math.min(c.length, i+10)))}`);
    }
  }
}
