import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';
import { getRepo, deleteRepo, starRepo, unstarRepo } from '../api/repos';
import { listFiles } from '../api/files';

export default function RepositoryOverview() {
  const { ownerUsername, repoName } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState({
    loading: true,
    repository: null,
    isOwner: false,
    isStarred: false,
    files: [],
    error: '',
  });
  const [starBusy, setStarBusy] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const { repository, isOwner, isStarred } = await getRepo(ownerUsername, repoName);
      const { files } = await listFiles(ownerUsername, repoName);
      setState({ loading: false, repository, isOwner, isStarred, files, error: '' });
    } catch (err) {
      setState({
        loading: false,
        repository: null,
        isOwner: false,
        isStarred: false,
        files: [],
        error: err.response?.status === 404 ? 'Repository not found.' : 'Could not load this repository.',
      });
    }
  }, [ownerUsername, repoName]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete ${ownerUsername}/${repoName}? This cannot be undone.`)) return;
    await deleteRepo(ownerUsername, repoName);
    navigate('/dashboard', { replace: true });
  }

  async function toggleStar() {
    setStarBusy(true);
    try {
      const result = state.isStarred
        ? await unstarRepo(ownerUsername, repoName)
        : await starRepo(ownerUsername, repoName);
      setState((s) => ({
        ...s,
        isStarred: result.starred,
        repository: { ...s.repository, starCount: result.starCount },
      }));
    } catch {
      // A double-click racing the 409/idempotent-unstar cases is harmless --
      // just reload from the server to resync rather than show an error for
      // something that isn't really a failure from the user's perspective.
      load();
    } finally {
      setStarBusy(false);
    }
  }

  if (state.loading) {
    return <div className="page-loading">Loading...</div>;
  }

  if (state.error) {
    return (
      <div className="page-wide">
        <div className="card">
          <p className="error-banner">{state.error}</p>
        </div>
      </div>
    );
  }

  const { repository, isOwner, isStarred, files } = state;

  return (
    <div className="page-wide">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ margin: 0 }}>
            <Link to={`/users/${repository.owner.username}`}>{repository.owner.username}</Link> / {repository.name}
          </h1>
          <span className={`badge badge-${repository.visibility}`}>{repository.visibility}</span>
        </div>

        {repository.description && <p className="muted">{repository.description}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          {user && (
            <button className={`btn-inline ${isStarred ? 'btn-primary' : ''}`} onClick={toggleStar} disabled={starBusy}>
              {isStarred ? '★ Starred' : '☆ Star'} ({repository.starCount})
            </button>
          )}
          {!user && <span className="muted">★ {repository.starCount}</span>}
          {isOwner && (
            <button className="btn-inline btn-danger" onClick={handleDelete}>
              Delete repository
            </button>
          )}
        </div>

        <hr className="divider" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Issues</h2>
          <Link className="btn-inline" to={`/repos/${ownerUsername}/${repoName}/issues`}>
            View issues
          </Link>
        </div>

        <hr className="divider" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Files</h2>
          {isOwner && (
            <Link className="btn-inline btn-primary" to={`/repos/${ownerUsername}/${repoName}/files/new`}>
              Add file
            </Link>
          )}
        </div>

        {files.length === 0 && <p className="muted">No files yet.</p>}
        <div className="file-list">
          {files.map((f) => (
            <Link
              key={f._id}
              className="file-row"
              to={`/repos/${ownerUsername}/${repoName}/file?path=${encodeURIComponent(f.path)}`}
            >
              <span>{f.path}</span>
              <span className="muted">v{f.version}</span>
            </Link>
          ))}
        </div>

        <hr className="divider" />

        <h2>README</h2>
        {repository.readme ? (
          <div className="markdown-body">
            <ReactMarkdown>{repository.readme}</ReactMarkdown>
          </div>
        ) : (
          <p className="muted">No README yet.</p>
        )}
      </div>
    </div>
  );
}
