const fs = require('fs');
const { createServer } = require('vite');

async function testCode(code, label) {
  fs.writeFileSync('tmp_test_code.jsx', code);
  const server = await createServer({
    root: '.',
    plugins: [require('@vitejs/plugin-react')()],
    logLevel: 'error',
  });
  try {
    await server.transformRequest('/tmp_test_code.jsx');
    console.log(label + ': OK');
  } catch(e) {
    const msg = e.message || '';
    console.log(label + ': ERROR - ' + msg.substring(0, 300));
  }
  await server.close();
  fs.unlinkSync('tmp_test_code.jsx');
}

async function main() {
  const fullCode = fs.readFileSync('src/App.jsx', 'utf8');
  const lines = fullCode.split('\n');
  const topbarIdx = lines.findIndex(l => l.includes('header className="topbar"'));
  
  // Test with first 100 lines (ending just before topbar)
  for (const lineCount of [50, 100, 150, 200, 250, 270]) {
    let code = lines.slice(0, lineCount).join('\n');
    // Remove any incomplete JSX
    // Just test the JS before the topbar
    try {
      await testCode(code + '\nexport default null;', 'First ' + lineCount + ' lines');
    } catch(e) {}
  }
}

main().catch(console.error);
