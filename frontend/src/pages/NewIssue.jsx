import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createIssue } from '../api/issues';

export default function NewIssue() {
  const { ownerUsername, repoName } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({ title: '', description: '', labels: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const labels = form.labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);
      const { issue } = await createIssue(ownerUsername, repoName, {
        title: form.title,
        description: form.description,
        labels,
      });
      navigate(`/repos/${ownerUsername}/${repoName}/issues/${issue.number}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create issue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1>New issue</h1>
        <p className="muted">
          {ownerUsername}/{repoName}
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" value={form.title} onChange={handleChange} required />

          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={6} value={form.description} onChange={handleChange} />

          <label htmlFor="labels">Labels (comma-separated)</label>
          <input
            id="labels"
            name="labels"
            placeholder="bug, help-wanted"
            value={form.labels}
            onChange={handleChange}
          />

          {error && <div className="error-banner">{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create issue'}
          </button>
        </form>
      </div>
    </div>
  );
}
