const { createServer } = require('vite');

async function test() {
  const server = await createServer({
    root: '.',
    plugins: [require('@vitejs/plugin-react')()],
    logLevel: 'error',
  });

  try {
    const result = await server.transformRequest('/src/components/ContactButtons.jsx');
    console.log('ContactButtons transform OK');
  } catch(e) {
    console.log('ContactButtons Error:', e.message);
  }

  try {
    const result = await server.transformRequest('src/App.jsx');
    console.log('App.jsx transform OK');
  } catch(e) {
    console.log('App.jsx Error:', e.message);
  }

  await server.close();
}
test();
