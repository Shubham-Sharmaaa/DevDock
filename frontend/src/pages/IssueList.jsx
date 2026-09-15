import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listIssues } from '../api/issues';

export default function IssueList() {
  const { ownerUsername, repoName } = useParams();
  const { user } = useAuth();

  const [status, setStatus] = useState('open');
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { issues: list } = await listIssues(ownerUsername, repoName, { status });
      setIssues(list);
    } catch (err) {
      setError(err.response?.status === 404 ? 'Repository not found.' : 'Could not load issues.');
    } finally {
      setLoading(false);
    }
  }, [ownerUsername, repoName, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page-wide">
      <div className="card">
        <Link to={`/repos/${ownerUsername}/${repoName}`} className="muted">
          &larr; {ownerUsername}/{repoName}
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <h1 style={{ margin: 0 }}>Issues</h1>
          {user && (
            <Link className="btn-inline btn-primary" to={`/repos/${ownerUsername}/${repoName}/issues/new`}>
              New issue
            </Link>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            className={`btn-inline ${status === 'open' ? 'btn-primary' : ''}`}
            onClick={() => setStatus('open')}
          >
            Open
          </button>
          <button
            className={`btn-inline ${status === 'closed' ? 'btn-primary' : ''}`}
            onClick={() => setStatus('closed')}
          >
            Closed
          </button>
        </div>

        {error && <p className="error-banner">{error}</p>}
        {loading && <p className="muted">Loading...</p>}
        {!loading && issues.length === 0 && <p className="muted">No {status} issues.</p>}

        <div className="issue-list">
          {issues.map((issue) => (
            <Link
              key={issue._id}
              className="issue-row"
              to={`/repos/${ownerUsername}/${repoName}/issues/${issue.number}`}
            >
              <div className="issue-row-title">
                #{issue.number} {issue.title}
              </div>
              <div className="muted">
                opened by {issue.author.username}
                {issue.labels.length > 0 && (
                  <>
                    {' '}
                    &middot;{' '}
                    {issue.labels.map((l) => (
                      <span key={l} className="label-chip">
                        {l}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
