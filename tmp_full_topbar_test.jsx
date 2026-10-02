import React from 'react';
const ROLE_ICONS = { buyer: '\u2302', seller: '\u2197', driver: '\u21e2', institution: '\u25a6', ops: '\u25c8' };
const t = { buyer: 'Buyer', driver: 'Driver', seller: 'Seller', institution: 'Institution', ops: 'Ops' };

function App() {
  const canSignOut = true;
  const aiOpen = false;
  const roleUnread = 0;
  const notificationsOpen = false;
  const role = 'driver';
  const region = 'Accra';
  const language = 'en';
  const languages = [['en', 'English']];
  const toggleAi = () => {};
  const signOut = () => {};
  const showNotice = (msg) => console.log(msg);
  const setLanguage = () => {};
  const setRegion = () => {};
  const setNotificationsOpen = () => {};

  return (
    <div className="app-shell">
      <nav className="mobile-tabs" aria-label="Workspaces">
        <button className={`mobile-tab ${role === 'driver' ? 'active' : ''}`} key="driver" type="button" aria-current="page" onClick={() => {}}>
          <span className={`role-icon driver`} aria-hidden="true">{ROLE_ICONS['driver']}</span>
          <span className="mobile-tab-label">Driver</span>
          {role === role && roleUnread > 0 && <em>{roleUnread}</em>}
        </button>
      </nav>
      <aside className="sidebar">
        <a className="app-logo" href="#main" aria-label="AquaLink dashboard"><span>A</span>Aqua<strong>Link</strong></a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="role-list">
          <button className={`role-button ${role === 'driver' ? 'active' : ''}`} key="driver" type="button" onClick={() => {}}><span className={`role-icon driver`} aria-hidden="true">{ROLE_ICONS['driver']}</span><span><b>Driver</b><small>Water delivery</small></span></button>
        </div>
      </aside>
      <main className="main-content" id="main">
        <header className="topbar"><div className="breadcrumb"><span>AquaLink</span><i>/</i><strong>{t[role]}</strong><select aria-label="Operating region" value={region} onChange={(event) => { setRegion(event.target.value); showNotice(`Workspace switched to ${event.target.value}.`); }}><option>Accra</option><option>Kumasi</option><option>Takoradi</option><option>Tema</option><option>Lagos</option><option>Abidjan</option></select></div><div className="topbar-actions"><label className="language-picker"><span>文</span><select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><button className={`ai-trigger ${aiOpen ? 'active' : ''}`} type="button" onClick={toggleAi}><span>✦</span> Aqua AI</button><button className="icon-button" type="button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}><span>♧</span>{roleUnread > 0 && <em>{roleUnread}</em>}</button>{canSignOut && <button className="icon-button topbar-signout" type="button" aria-label="Sign out" title="Sign out" onClick={() => signOut()}><span>⎋</span></button>}<button className="profile mobile-profile" type="button"><span className="avatar">AK</span></button></div></header>
        <p>Test content</p>
      </main>
    </div>
  );
}
export default App;
