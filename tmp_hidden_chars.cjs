const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');

// Check for zero-width characters and other invisible Unicode
console.log('=== Invisible/control characters ===');
for (let i = 0; i < c.length; i++) {
  const code = c.charCodeAt(i);
  if ((code >= 0x2000 && code <= 0x200F) || // General Punctuation (zero-width spaces etc)
      (code >= 0x2028 && code <= 0x202F) || // Line/Paragraph separators
      (code >= 0x2050 && code <= 0x205E) || // Various
      (code >= 0xFE00 && code <= 0xFE0F) || // Variation selectors
      (code >= 0xFEFF) ||                   // BOM
      (code >= 0xE000 && code <= 0xF8FF)) { // Private use
    console.log(`Pos ${i}: U+${code.toString(16).toUpperCase().padStart(4, '0')} context: ${JSON.stringify(c.substring(Math.max(0, i-20), i+20))}`);
  }
}

// Also check for unusual bracket patterns
console.log('\n=== Checking template literal backticks ===');
let backtickCount = 0;
let inJsx = false;
let inJsxExpr = false;

for (let i = 0; i < c.length; i++) {
  const ch = c[i];
  if (ch === '\n') continue; // skip newline counting
  if (ch === '`') {
    backtickCount++;
    if (backtickCount <= 4 || backtickCount > 20) { // show first few and any after
      const lineNum = c.substring(0, i).split('\n').length;
      console.log(`Backtick #${backtickCount} at pos ${i}, line ${lineNum}: ${JSON.stringify(c.substring(Math.max(0, i-30), i+30))}`);
    }
  }
}
console.log('Total backticks:', backtickCount);
console.log('Backticks should be even:', backtickCount % 2 === 0);
