import { useCallback, useEffect, useState } from 'react';
import { listAccounts, createAccount, findAccount, deleteAccount, updateAccount, ACCOUNT_ROLES } from '../lib/accounts';
import { formatPhoneForDisplay } from '../lib/accounts';

/**
 * Admin account management panel.
 *
 * Allows the default master account to view, create, and manage admin/ops accounts
 * locally. Server-side ops authentication is separate and handled by the API.
 */
export default function AdminManagement({ opsToken, onNotice, isDefaultAccount }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(null);
  const [form, setForm] = useState({
    identifier: '',
    role: 'ops',
    displayName: '',
    password: '',
  });
  const [editId, setEditId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const all = listAccounts();
      setAccounts(all);
    } catch (err) {
      setError(err.message || 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = useCallback(() => {
    setForm({ identifier: '', role: 'ops', displayName: '', password: '' });
    setEditId(null);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const { identifier, role, displayName, password } = form;
    if (!identifier.trim()) {
      setError('Enter an email or phone number.');
      return;
    }
    if (!password && !editId) {
      setError('Password is required for new accounts.');
      return;
    }

    setSaving(editId || 'new');
    setError('');

    try {
      if (editId) {
        const updated = updateAccount(editId, { role, displayName, password: password || undefined });
        if (!updated) throw new Error('Account not found.');
        setAccounts(accounts.map(a => a.id === editId ? updated : a));
        onNotice?.('Account updated.');
      } else {
        const account = await createAccount({ identifier, role, displayName, password });
        setAccounts([...accounts, account]);
        onNotice?.(`Account created for ${account.identifier}.`);
      }
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(account) {
    if (!confirm(`Delete account ${account.identifier}? This cannot be undone.`)) return;
    try {
      deleteAccount(account.identifier);
      setAccounts(accounts.filter(a => a.id !== account.id));
      onNotice?.('Account deleted.');
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(account) {
    setForm({
      identifier: account.identifier,
      role: account.role,
      displayName: account.displayName,
      password: '',
    });
    setEditId(account.id);
  }

  if (!opsToken && !isDefaultAccount) {
    return (
      <section className="panel admin-panel">
        <div className="section-heading">
          <div><span className="section-kicker">ADMIN MANAGEMENT</span><h2>Accounts</h2></div>
        </div>
        <p className="empty-feed">Sign in as an operator to manage accounts.</p>
      </section>
    );
  }

  const opsAccounts = accounts.filter(a => a.role === 'ops' || a.role === 'institution');
  const otherAccounts = accounts.filter(a => a.role !== 'ops' && a.role !== 'institution');

  return (
    <section className="panel admin-panel" aria-label="Admin account management">
      <div className="section-heading">
        <div><span className="section-kicker">ADMIN MANAGEMENT</span><h2>Accounts</h2></div>
        <span className="queue-count">
          {loading ? 'Loading…' : `${accounts.length} total`}
        </span>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {/* Create/Edit Form */}
      <form onSubmit={handleSubmit} className="admin-form" style={{ marginBottom: '20px', padding: '16px', background: '#f6f8f8', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 12px' }}>{editId ? 'Edit Account' : 'Add Admin Account'}</h3>
        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#3d5150' }}>
              Email or Phone
            </label>
            <input
              type="text"
              value={form.identifier}
              onChange={e => setForm({ ...form, identifier: e.target.value })}
              placeholder="admin@example.com or 0545009046"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #dbe4e3', borderRadius: '9px', fontSize: '14px' }}
              disabled={editId || saving}
            />
            {editId && <small style={{ color: '#6c7d7b', fontSize: '12px' }}>Identifier cannot be changed</small>}
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#3d5150' }}>
              Role
            </label>
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #dbe4e3', borderRadius: '9px', fontSize: '14px' }}
              disabled={saving}
            >
              {ACCOUNT_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#3d5150' }}>
              Display Name
            </label>
            <input
              type="text"
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
              placeholder="e.g. John Doe"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #dbe4e3', borderRadius: '9px', fontSize: '14px' }}
              disabled={saving}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#3d5150' }}>
              Password {editId ? '(leave blank to keep)' : '*'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder={editId ? '••••••••' : 'Min 8 characters'}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #dbe4e3', borderRadius: '9px', fontSize: '14px' }}
              disabled={saving}
              autoComplete={editId ? 'off' : 'new-password'}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            className="primary-button"
            disabled={saving}
            style={{ padding: '10px 20px' }}
          >
            {saving ? 'Saving…' : editId ? 'Update Account' : 'Create Account'}
          </button>
          {editId && (
            <button
              type="button"
              className="text-button"
              onClick={resetForm}
              disabled={saving}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Ops/Institution Accounts */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#0f6b62' }}>Ops & Institution Accounts ({opsAccounts.length})</h4>
        {opsAccounts.length === 0 ? (
          <p className="empty-feed">No ops or institution accounts yet. Create one above.</p>
        ) : (
          opsAccounts.map(account => (
            <div key={account.id} className="admin-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #eef2f1' }}>
              <span>
                <strong>{account.identifier}</strong>
                <small style={{ marginLeft: '8px', color: '#6c7d7b' }}>
                  {account.displayName ? ` · ${account.displayName}` : ''}
                  {account.role !== 'ops' && ` · ${account.role}`}
                  {account.isDefaultAccount && ' · <span style="color: #0f6b62; font-weight: 600;">DEFAULT MASTER</span>'}
                </small>
                <br />
                <small style={{ color: '#6c7d7b' }}>
                  {account.provider === 'local' ? 'Local (password)' : account.provider}
                  {account.phone && ` · ${formatPhoneForDisplay(account.phone)}`}
                  {account.lastLoginAt && ` · Last: ${new Date(account.lastLoginAt).toLocaleString()}`}
                </small>
              </span>
              <span className="confirm-row">
                <button
                  className="confirm-button"
                  type="button"
                  onClick={() => startEdit(account)}
                  disabled={saving}
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                >
                  Edit
                </button>
                {!account.isDefaultAccount && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => handleDelete(account)}
                    disabled={saving}
                    style={{ color: '#b3261e' }}
                  >
                    Delete
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Other Accounts (Buyers, Sellers, Drivers) - Read Only */}
      <details style={{ border: '1px solid #e6eceb', borderRadius: '12px', padding: '16px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#0f6b62' }}>
          Other Accounts ({otherAccounts.length}) - Click to expand
        </summary>
        {otherAccounts.length === 0 ? (
          <p className="empty-feed" style={{ marginTop: '12px' }}>No buyer, seller, or driver accounts yet.</p>
        ) : (
          otherAccounts.map(account => (
            <div key={account.id} className="admin-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid #eef2f1' }}>
              <span>
                <strong>{account.identifier}</strong>
                <small style={{ marginLeft: '8px', color: '#6c7d7b' }}>
                  {account.displayName ? ` · ${account.displayName}` : ''}
                  <span style={{ background: '#e6eceb', color: '#0f6b62', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', marginLeft: '8px', textTransform: 'uppercase' }}>
                    {account.role}
                  </span>
                </small>
                <br />
                <small style={{ color: '#6c7d7b' }}>
                  {account.provider === 'local' ? 'Local' : account.provider}
                  {account.phone && ` · ${formatPhoneForDisplay(account.phone)}`}
                  {account.status === 'suspended' && ' · <span style="color: #b3261e;">SUSPENDED</span>'}
                  {account.lockedUntil && account.lockedUntil > Date.now() && ' · <span style="color: #b3261e;">LOCKED</span>'}
                </small>
              </span>
              <span className="confirm-row">
                <button
                  className="confirm-button"
                  type="button"
                  onClick={() => startEdit(account)}
                  disabled={saving}
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                >
                  Edit
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => handleDelete(account)}
                  disabled={saving}
                  style={{ color: '#b3261e' }}
                >
                  Delete
                </button>
              </span>
            </div>
          ))
        )}
      </details>
    </section>
  );
}