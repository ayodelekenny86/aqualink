const { createServer } = require('vite');

async function test() {
  const server = await createServer({
    root: '.',
    plugins: [require('@vitejs/plugin-react')()],
    logLevel: 'error',
  });
  try {
    await server.transformRequest('/tmp_full_topbar_test.jsx');
    console.log('Full topbar test: OK');
  } catch(e) {
    console.log('Full topbar test: ERROR -', (e.message || '').substring(0, 500));
  }
  await server.close();
}
test();
