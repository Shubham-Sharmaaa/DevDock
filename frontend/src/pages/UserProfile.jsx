import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getUserProfile } from '../api/users';

export default function UserProfile() {
  const { username } = useParams();

  const [profile, setProfile] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getUserProfile(username)
      .then(({ user, repositories: repos }) => {
        if (cancelled) return;
        setProfile(user);
        setRepositories(repos);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.status === 404 ? 'User not found.' : 'Could not load this profile.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }

  if (error) {
    return (
      <div className="page-wide">
        <div className="card">
          <p className="error-banner">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wide">
      <div className="card">
        <h1 style={{ margin: 0 }}>{profile.username}</h1>
        <p className="muted">Joined {new Date(profile.createdAt).toLocaleDateString()}</p>
        {profile.bio && <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{profile.bio}</p>}

        <hr className="divider" />

        <h2 style={{ margin: 0 }}>Public repositories</h2>
        {repositories.length === 0 && (
          <p className="muted" style={{ marginTop: 8 }}>
            No public repositories yet.
          </p>
        )}
        <div className="repo-list">
          {repositories.map((repo) => (
            <Link key={repo._id} className="repo-card" to={`/repos/${profile.username}/${repo.name}`}>
              <div className="repo-card-title">
                <span>{repo.name}</span>
                <span className="muted">★ {repo.starCount}</span>
              </div>
              {repo.description && <p className="muted">{repo.description}</p>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
