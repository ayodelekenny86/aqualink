const fs = require('fs');
const { createServer } = require('vite');

const fullCode = fs.readFileSync('src/App.jsx', 'utf8');
const lines = fullCode.split('\n');

// Find key positions
const topbarLineIdx = lines.findIndex(l => l.includes('header className="topbar"'));
console.log('Topbar line:', topbarLineIdx + 1);

// Strategy: take first N lines, replace incomplete JSX with closing, and add the topbar
async function testChunk(n, label) {
  // Get first N lines
  let code = lines.slice(0, n).join('\n');
  // Remove incomplete JSX by stripping everything after the last complete statement
  // Simple approach: just add closing for the function
  
  fs.writeFileSync('tmp_chunk_test.jsx', code + '\nexport default null;\n');
  
  const server = await createServer({
    root: '.',
    plugins: [require('@vitejs/plugin-react')()],
    logLevel: 'error',
  });
  
  try {
    await server.transformRequest('/tmp_chunk_test.jsx');
    console.log(label + ' (' + n + ' lines): OK');
  } catch(e) {
    const msg = (e.message || '').split('\n').map(l => l.trim()).join(' ');
    console.log(label + ' (' + n + ' lines): ERROR - ' + msg.substring(0, 200));
  }
  await server.close();
}

// Test various chunks
// The key insight: if a chunk parses OK, the issue is later. If it fails, the issue is in that chunk.
async function run() {
  // First test: first 100 lines (should fail due to import resolution, not parse)
  // Let's skip import resolution issues by looking for parse-only errors
  
  // Test sections: skip past imports and check JSX sections
  for (const n of [100, 150, 200, 230, 240, 245, 249, 250, 255, 260, 265, 269, 279]) {
    await testChunk(n, 'First chunk');
  }
}

run().catch(console.error);
