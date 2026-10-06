import { useCallback, useEffect, useState } from 'react';
import { listSellerApplications, reviewSeller } from '../lib/payments';

/**
 * The operator-side seller approval queue.
 *
 * This panel used to be three hardcoded rows — "S-019 · ID + vehicle docs",
 * "S-021 · Water-source certificate", "S-024 · New registration" — under a
 * hardcoded "3 pending" badge. An operator working that list was reading
 * fiction, and the "Review →" buttons did nothing.
 *
 * Now it reads real applications from the server and records a real decision.
 * The approval itself is the same server endpoint the seller cannot reach, so a
 * decision made here is the one the seller's status check will report.
 */
export default function SellerApprovalQueue({ opsToken, onNotice }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  // Distinguishes "still loading" from "loaded and genuinely empty". Without it
  // the panel says no applications are waiting while the request is still in
  // flight, which is indistinguishable from an empty queue.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState(null);

  const load = useCallback(async () => {
    if (!opsToken) return;
    setLoading(true);
    setError('');
    try {
      const result = await listSellerApplications({ status: 'pending', token: opsToken });
      setApplications(result.applications ?? []);
    } catch (problem) {
      setError(problem.message || 'Could not load the review queue.');
      setApplications([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [opsToken]);

  useEffect(() => { load(); }, [load]);

  async function decide(application, decision) {
    setDeciding(application.applicationId);
    try {
      await reviewSeller({ applicationId: application.applicationId, decision, token: opsToken });
      onNotice?.(
        decision === 'approve'
          ? `${application.business || application.applicationId} approved.`
          : `${application.business || application.applicationId} rejected.`,
      );
      // Re-read rather than filtering locally: the server owns this list, and a
      // second decision on the same application is rejected anyway.
      await load();
    } catch (problem) {
      onNotice?.(problem.message || 'The decision was not recorded.');
    } finally {
      setDeciding(null);
    }
  }

  if (!opsToken) {
    return <section className="panel admin-panel"><div className="section-heading"><div><span className="section-kicker">SELLER APPROVAL QUEUE</span><h2>Manual reviews</h2></div></div><p className="empty-feed">Sign in as an operator to review seller applications.</p></section>;
  }

  return <section className="panel admin-panel" aria-label="Seller approval queue">
    <div className="section-heading">
      <div><span className="section-kicker">SELLER APPROVAL QUEUE</span><h2>Manual reviews</h2></div>
      <span className="queue-count">
        {loading ? 'Loading' : `${applications.length} pending`}
      </span>
    </div>

    {error && <p className="form-error" role="alert">{error}</p>}

    {!error && !loaded && <div className="loading-state"><div className="loading-spinner" /></div>}

    {loaded && !error && applications.length === 0 && (
      <p className="empty-feed">No seller applications are waiting. This queue is empty until a seller applies.</p>
    )}

    {applications.map((application) => (
      <div className="admin-row" key={application.applicationId}>
        <span>
          {application.applicationId} · {application.business || 'Unnamed business'}
          <small>
            {application.vehicle ? `${application.vehicle} · ` : ''}
            {application.capacity ? `${application.capacity} · ` : ''}
            {application.phone || 'no phone on file'}
          </small>
        </span>
        <span className="confirm-row">
          <button
            className="confirm-button"
            type="button"
            disabled={deciding === application.applicationId}
            onClick={() => decide(application, 'approve')}
          >
            Approve
          </button>
          <button
            className="text-button"
            type="button"
            disabled={deciding === application.applicationId}
            onClick={() => decide(application, 'reject')}
          >
            Reject
          </button>
        </span>
      </div>
    ))}
  </section>;
}