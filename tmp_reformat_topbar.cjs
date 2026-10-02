const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');

// Find the topbar line
const topbarStart = c.indexOf('<header className="topbar">');
if (topbarStart === -1) {
  console.log('Topbar not found!');
  process.exit(1);
}

// Find the end of the header tag
const headerEnd = c.indexOf('</header>', topbarStart);
if (headerEnd === -1) {
  console.log('Header end not found!');
  process.exit(1);
}

const headerEndFull = headerEnd + '</header>'.length;
const topbarLine = c.substring(topbarStart, headerEndFull);
console.log('Found topbar line, length:', topbarLine.length);
console.log('First 50 chars:', topbarLine.substring(0, 50));
console.log('Last 50 chars:', topbarLine.substring(topbarLine.length - 50));

// Check if the file uses CRLF
const hasCRLF = c.includes('\r\n');
console.log('File has CRLF:', hasCRLF);
console.log('Topbar line has CRLF:', topbarLine.includes('\r\n'));

// Create the multi-line version
const multilineTopbar = `<header className="topbar">
            <div className="breadcrumb">
              <span>AquaLink</span><i>/</i><strong>{'{t[role]}'}</strong>
              <select aria-label="Operating region" value={region} onChange={(event) => { setRegion(event.target.value); showNotice(\`Workspace switched to ${'$'}{event.target.value}.\`); }}>
                <option>Accra</option><option>Kumasi</option><option>Takoradi</option><option>Tema</option><option>Lagos</option><option>Abidjan</option>
              </select>
            </div>
            <div className="topbar-actions">
              <label className="language-picker"><span>文</span>
                <select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {languages.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                </select>
              </label>
              <button className={`ai-trigger ${aiOpen ? 'active' : ''}`} type="button" onClick={toggleAi}>
                <span>✦</span> Aqua AI
              </button>
              <button className="icon-button" type="button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}>
                <span>♧</span>
                {roleUnread > 0 && <em>{roleUnread}</em>}
              </button>
              {canSignOut && <button className="icon-button topbar-signout" type="button" aria-label="Sign out" title="Sign out" onClick={() => signOut()}><span>⎋</span></button>}
              <button className="profile mobile-profile" type="button"><span className="avatar">AK</span></button>
            </div>
          </header>`;

// Preserve CRLF if the file uses it
const separator = hasCRLF ? '\r\n' : '\n';
const indent = c.substring(c.lastIndexOf(separator, topbarStart) + separator.length, topbarStart);
console.log('Indent:', JSON.stringify(indent));

const indentedMultiline = multilineTopbar.split('\n').map(l => indent + l).join(separator);

const newCode = c.substring(0, topbarStart) + indentedMultiline + c.substring(headerEndFull);

fs.writeFileSync('src/App.jsx', newCode);
console.log('File written successfully');
