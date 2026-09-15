import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listMyRepos } from '../api/repos';
import { getMyActivity } from '../api/activity';

// Turns a raw ActivityEvent into a human-readable line + a link to go with
// it. Kept local to the Dashboard since it's the only place events render --
// if a second feed view is added later this is the first thing to extract.
function describeEvent(event) {
  const repoLink = `/repos/${event.repositoryOwnerUsername}/${event.repositoryName}`;
  switch (event.type) {
    case 'repo_created':
      return { text: `created repository ${event.repositoryOwnerUsername}/${event.repositoryName}`, link: repoLink };
    case 'file_created':
      return {
        text: `added ${event.detail.path} to ${event.repositoryOwnerUsername}/${event.repositoryName}`,
        link: `${repoLink}/file?path=${encodeURIComponent(event.detail.path)}`,
      };
    case 'file_revised':
      return {
        text: `updated ${event.detail.path} in ${event.repositoryOwnerUsername}/${event.repositoryName}`,
        link: `${repoLink}/file?path=${encodeURIComponent(event.detail.path)}`,
      };
    case 'issue_opened':
      return {
        text: `opened issue #${event.detail.issueNumber} "${event.detail.title}" in ${event.repositoryOwnerUsername}/${event.repositoryName}`,
        link: `${repoLink}/issues/${event.detail.issueNumber}`,
      };
    case 'issue_status_changed':
      return {
        text: `${event.detail.status === 'closed' ? 'closed' : 'reopened'} issue #${event.detail.issueNumber} in ${event.repositoryOwnerUsername}/${event.repositoryName}`,
        link: `${repoLink}/issues/${event.detail.issueNumber}`,
      };
    case 'repo_starred':
      return { text: `starred ${event.repositoryOwnerUsername}/${event.repositoryName}`, link: repoLink };
    default:
      return { text: event.type, link: repoLink };
  }
}

export default function Dashboard() {
  const { user, logout, updateBio } = useAuth();
  const navigate = useNavigate();

  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [bioError, setBioError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listMyRepos()
      .then(({ repositories }) => {
        if (!cancelled) setRepos(repositories);
      })
      .finally(() => {
        if (!cancelled) setReposLoading(false);
      });
    getMyActivity()
      .then(({ events: list }) => {
        if (!cancelled) setEvents(list);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function startEditingBio() {
    setBioDraft(user?.bio || '');
    setBioError('');
    setEditingBio(true);
  }

  async function saveBio() {
    setBioSaving(true);
    setBioError('');
    try {
      await updateBio(bioDraft);
      setEditingBio(false);
    } catch (err) {
      setBioError(err.response?.data?.error || 'Could not save bio.');
    } finally {
      setBioSaving(false);
    }
  }

  return (
    <div className="page-wide">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Welcome, {user?.username}</h1>
          <button className="btn-inline" onClick={handleLogout}>
            Log out
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {!editingBio && (
            <>
              <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {user?.bio || 'No bio yet.'}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="btn-inline" onClick={startEditingBio}>
                  Edit bio
                </button>
                <Link className="btn-inline" to={`/users/${user?.username}`}>
                  View public profile
                </Link>
              </div>
            </>
          )}
          {editingBio && (
            <div>
              <textarea
                rows={3}
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                maxLength={280}
              />
              {bioError && <div className="error-banner">{bioError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-inline btn-primary" onClick={saveBio} disabled={bioSaving}>
                  {bioSaving ? 'Saving...' : 'Save bio'}
                </button>
                <button className="btn-inline" onClick={() => setEditingBio(false)} disabled={bioSaving}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="btn-inline btn-primary">
            Search
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 }}>
          <h2 style={{ margin: 0 }}>Your repositories</h2>
          <Link className="btn-inline btn-primary" to="/new">
            New repository
          </Link>
        </div>

        {reposLoading && <p className="muted">Loading...</p>}
        {!reposLoading && repos.length === 0 && <p className="muted">You haven't created any repositories yet.</p>}

        <div className="repo-list">
          {repos.map((repo) => (
            <Link key={repo._id} to={`/repos/${user.username}/${repo.name}`} className="repo-card">
              <div className="repo-card-title">
                <span>{repo.name}</span>
                <span className={`badge badge-${repo.visibility}`}>{repo.visibility}</span>
              </div>
              {repo.description && <p className="muted">{repo.description}</p>}
            </Link>
          ))}
        </div>

        <hr className="divider" />

        <h2 style={{ margin: 0 }}>Recent activity</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Your own actions across your repositories -- real events, not a decorative graph.
        </p>

        {eventsLoading && <p className="muted">Loading...</p>}
        {!eventsLoading && events.length === 0 && <p className="muted">No activity yet.</p>}

        <div className="activity-list">
          {events.map((event) => {
            const { text, link } = describeEvent(event);
            return (
              <Link key={event._id} to={link} className="activity-row">
                <span>{text}</span>
                <span className="muted">{new Date(event.createdAt).toLocaleString()}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
