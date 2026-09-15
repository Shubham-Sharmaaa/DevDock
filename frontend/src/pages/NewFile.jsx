import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createFile } from '../api/files';

export default function NewFile() {
  const { ownerUsername, repoName } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ path: '', content: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // This is a UX convenience, not the actual access control -- the backend
  // (requireAuth + requireRepositoryOwner on POST /files) is what really
  // enforces this, and returns 401/403 regardless of what the UI shows.
  if (user && user.username !== ownerUsername) {
    return (
      <div className="page-wide">
        <div className="card">
          <p className="error-banner">Only the repository owner can add files here.</p>
        </div>
      </div>
    );
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { file } = await createFile(ownerUsername, repoName, form);
      navigate(`/repos/${ownerUsername}/${repoName}/file?path=${encodeURIComponent(file.path)}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create file.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1>Add a file</h1>
        <p className="muted">
          {ownerUsername}/{repoName}
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="path">Path</label>
          <input
            id="path"
            name="path"
            placeholder="src/index.js"
            value={form.path}
            onChange={handleChange}
            required
          />

          <label htmlFor="content">Content</label>
          <textarea
            id="content"
            name="content"
            rows={12}
            style={{ fontFamily: 'monospace' }}
            value={form.content}
            onChange={handleChange}
          />

          {error && <div className="error-banner">{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create file'}
          </button>
        </form>
      </div>
    </div>
  );
}
