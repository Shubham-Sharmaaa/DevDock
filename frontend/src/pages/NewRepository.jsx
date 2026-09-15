import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createRepo } from '../api/repos';

export default function NewRepository() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', description: '', readme: '', visibility: 'public' });
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
      const { repository } = await createRepo(form);
      navigate(`/repos/${user.username}/${repository.name}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create repository.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1>Create a new repository</h1>
        <form onSubmit={handleSubmit}>
          <label htmlFor="name">Repository name</label>
          <input id="name" name="name" value={form.name} onChange={handleChange} required />

          <label htmlFor="description">Description</label>
          <input id="description" name="description" value={form.description} onChange={handleChange} />

          <label htmlFor="readme">README</label>
          <textarea id="readme" name="readme" rows={6} value={form.readme} onChange={handleChange} />

          <label htmlFor="visibility">Visibility</label>
          <select id="visibility" name="visibility" value={form.visibility} onChange={handleChange}>
            <option value="public">Public — anyone can view</option>
            <option value="private">Private — only you can view</option>
          </select>

          {error && <div className="error-banner">{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create repository'}
          </button>
        </form>
      </div>
    </div>
  );
}
