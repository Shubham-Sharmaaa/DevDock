import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { searchRepos } from '../api/repos';

export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';

  const [inputValue, setInputValue] = useState(q);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!q) {
      setResults(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    searchRepos(q)
      .then(({ repositories }) => {
        if (!cancelled) setResults(repositories);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || 'Search failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  function handleSubmit(e) {
    e.preventDefault();
    setSearchParams(inputValue.trim() ? { q: inputValue.trim() } : {});
  }

  return (
    <div className="page-wide">
      <div className="card">
        <h1>Search repositories</h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="e.g. weather, api, react"
          />
          <button type="submit" className="btn-inline btn-primary">
            Search
          </button>
        </form>

        {loading && (
          <p className="muted" style={{ marginTop: 16 }}>
            Searching...
          </p>
        )}
        {error && <p className="error-banner">{error}</p>}
        {!loading && q && results && results.length === 0 && (
          <p className="muted" style={{ marginTop: 16 }}>
            No repositories found for "{q}".
          </p>
        )}

        {results && results.length > 0 && (
          <div className="repo-list" style={{ marginTop: 16 }}>
            {results.map((repo) => (
              <Link key={repo._id} className="repo-card" to={`/repos/${repo.owner.username}/${repo.name}`}>
                <div className="repo-card-title">
                  <span>
                    {repo.owner.username}/{repo.name}
                  </span>
                  <span className={`badge badge-${repo.visibility}`}>{repo.visibility}</span>
                </div>
                {repo.description && <p className="muted">{repo.description}</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
