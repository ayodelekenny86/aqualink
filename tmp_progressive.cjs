const fs = require('fs');
const { parse } = await import('node:url');
const path = require('path');

// Read the full file
const fullCode = fs.readFileSync('src/App.jsx', 'utf8');

// Find the topbar line start
const topbarStart = fullCode.indexOf('<header className="topbar">');
const lineStart = fullCode.lastIndexOf('\n', topbarStart) + 1;
const lineEnd = fullCode.indexOf('\n', topbarStart);
const topbarLine = fullCode.substring(lineStart, lineEnd);

console.log('Topbar line length:', topbarLine.length);
console.log('First 100 chars:', topbarLine.substring(0, 100));
console.log('Last 100 chars:', topbarLine.substring(topbarLine.length - 100));

// Create a minimal file with the first N lines + topbar
const allLines = fullCode.split('\r\n');
// Find the topbar line index
const topbarLineIdx = allLines.findIndex(l => l.includes('header className="topbar"'));
console.log('\nTopbar is on line', topbarLineIdx + 1);

// Create test files with progressively more content
async function testWithContent(lines, label) {
  const testCode = lines.join('\n') + '\nexport default App;\n';
  fs.writeFileSync('tmp_progressive_test.jsx', testCode);
  
  const { createServer } = await import('vite');
  const server = await createServer({
    root: '.',
    plugins: [require('@vitejs/plugin-react')()],
    logLevel: 'error',
  });
  
  try {
    await server.transformRequest('/tmp_progressive_test.jsx');
    console.log(label + ': OK');
  } catch(e) {
    console.log(label + ': ERROR - ' + (e.message || e).substring(0, 200));
  }
  await server.close();
}

// Test 1: Just the topbar line with minimal context
await testWithContent([
  'import React from "react";',
  'function App() {',
  '  const canSignOut = true;',
  '  const aiOpen = false;',
  '  const roleUnread = 0;',
  '  const notificationsOpen = false;',
  '  const role = "driver";',
  '  const t = { buyer: "Buyer", driver: "Driver" };',
  '  const region = "Accra";',
  '  const language = "en";',
  '  const languages = [["en", "English"]];',
  '  const toggleAi = () => {};',
  '  const signOut = () => {};',
  '  const showNotice = () => {};',
  '  const setLanguage = () => {};',
  '  const setRegion = () => {};',
  '  const setNotificationsOpen = () => {};',
  '  return (',
  topbarLine,
  '  );',
], 'Topbar alone');

// Test 2: First 50 lines + topbar
let lines50 = allLines.slice(0, 50).join('\n');
// Find the return statement in the first 50 lines
const test2Code = allLines.slice(0, 50).join('\n').replace(/\/\/.*\n/g, '\n') + '\n' + topbarLine + '\n);\nexport default App;';
fs.writeFileSync('tmp_progressive_test.jsx', test2Code);
console.log('Test 2 file written');
