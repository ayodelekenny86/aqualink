const { createServer } = require('vite');

async function test() {
  const server = await createServer({
    root: '.',
    plugins: [require('@vitejs/plugin-react')()],
    logLevel: 'error',
  });

  try {
    const result = await server.transformRequest('/tmp_topbar_test.jsx');
    console.log('Topbar transform OK');
  } catch(e) {
    console.log('Error:', e.message);
  }

  await server.close();
}
test();
