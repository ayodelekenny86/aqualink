const fs = require('fs');

// Read the multi-line topbar replacement (as raw text)
const newTopbar = fs.readFileSync('tmp_new_topbar.txt', 'utf8');

// Read App.jsx
const c = fs.readFileSync('src/App.jsx', 'utf8');

// Find the topbar
const topbarStart = c.indexOf('<header className="topbar">');
const headerEnd = c.indexOf('</header>', topbarStart) + '</header>'.length;
const topbarLine = c.substring(topbarStart, headerEnd);

console.log('Old topbar length:', topbarLine.length);
console.log('New topbar length:', newTopbar.length);

// Check the newline style
const lineStart = c.lastIndexOf('\n', topbarStart) + 1;
const beforeLine = c.substring(lineStart, topbarStart);
console.log('Before topbar on same line:', JSON.stringify(beforeLine));

// Check if CRLF
const hasCRLF = c.includes('\r\n');
console.log('Has CRLF:', hasCRLF);

// Convert newTopbar to CRLF if needed
let newContent = newTopbar;
if (hasCRLF) {
  newContent = newTopbar.replace(/\n/g, '\r\n');
}

const fullNewCode = c.substring(0, topbarStart) + newContent + c.substring(headerEnd);

fs.writeFileSync('src/App.jsx', fullNewCode);
console.log('Done! New file length:', fs.statSync('src/App.jsx').size);
