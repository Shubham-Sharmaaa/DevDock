import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page">
      <div className="card" style={{ textAlign: 'center' }}>
        <h1>404</h1>
        <p className="muted">That page doesn't exist.</p>
        <Link className="btn-inline btn-primary" to="/dashboard" style={{ marginTop: 12 }}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
