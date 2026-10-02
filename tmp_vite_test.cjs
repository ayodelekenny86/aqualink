const { createServer } = require('vite');

async function test() {
  const code = `function App() {
  const canSignOut = true;
  return (
    <div>
      {canSignOut && <button className="icon-button topbar-signout" type="button" aria-label="Sign out" title="Sign out" onClick={() => signOut()}><span>SignOut</span></button>}
      <button className="profile mobile-profile" type="button"><span className="avatar">AK</span></button>
    </div>
  );
}`;

  const server = await createServer({
    server: { middlewareMode: true },
    plugins: [require('@vitejs/plugin-react')()],
  });

  try {
    const result = await server.transformRequest('/test.jsx', code);
    console.log('Transform OK:', result.code?.substring(0, 200));
  } catch(e) {
    console.log('Transform Error:', e.message);
  }

  await server.close();
}
test();
