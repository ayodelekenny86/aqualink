import { useRatingsByBuyer } from '../hooks/useRatings';

function BuyerRatingsHistory({ buyerId, showNotice, ratings: ratingsProp, loading: loadingProp, error: errorProp }) {
  const hook = useRatingsByBuyer(buyerId);
  const ratings = ratingsProp ?? hook.ratings;
  const loading = loadingProp ?? hook.loading;
  const error = errorProp ?? hook.error;

  if (loading) {
    return (
      <section className="orders-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">YOUR RATINGS</span>
            <h2>Feedback you have submitted</h2>
          </div>
        </div>
        <p className="empty-feed">Loading your ratings...</p>
      </section>
    );
  }

  if (ratings.length === 0) {
    return (
      <section className="orders-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">YOUR RATINGS</span>
            <h2>Feedback you have submitted</h2>
          </div>
        </div>
        <p className="empty-feed">You have not submitted any ratings yet. After a delivery is confirmed, you can rate the driver and seller from your order history.</p>
      </section>
    );
  }

  return (
    <section className="orders-section">
      <div className="section-heading">
        <div>
          <span className="section-kicker">YOUR RATINGS</span>
          <h2>Feedback you have submitted</h2>
        </div>
        <button className="text-button" type="button" onClick={() => showNotice(`You have submitted ${ratings.length} rating${ratings.length !== 1 ? 's' : ''} in total.`)}>
          {ratings.length} total
        </button>
      </div>
      <div className="orders-table">
        <div className="table-head">
          <span>ORDER</span>
          <span>DATE</span>
          <span>DRIVER</span>
          <span>SELLER</span>
          <span>RATING</span>
        </div>
        {ratings.map((r) => (
          <div className="order-row" key={r.id}>
            <strong>{r.orderId}<small>{r.id.slice(0, 8)}</small></strong>
            <span>{new Date(r.createdAt).toLocaleDateString()}</span>
            <span>{r.driverId || '—'}</span>
            <span>{r.sellerId || '—'}</span>
            <span>
              <span className="rating-chip">
                <span className="stars rated">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} className={s <= (r.overall || 0) ? 'filled' : ''}>
                      ★
                    </span>
                  ))}
                </span>
                <small>{r.overall}/5</small>
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default BuyerRatingsHistory;
