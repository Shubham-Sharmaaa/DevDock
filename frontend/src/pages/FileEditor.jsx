import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getRepo } from '../api/repos';
import { getFileContent, updateFile, listFileRevisions } from '../api/files';

export default function FileEditor() {
  const { ownerUsername, repoName } = useParams();
  const [searchParams] = useSearchParams();
  const path = searchParams.get('path') || '';

  const [isOwner, setIsOwner] = useState(false);
  const [file, setFile] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null); // { currentVersion, currentContent }

  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState(null);
  const [expandedRevision, setExpandedRevision] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ isOwner: owns }, { file: loadedFile }] = await Promise.all([
        getRepo(ownerUsername, repoName),
        getFileContent(ownerUsername, repoName, path),
      ]);
      setIsOwner(owns);
      setFile(loadedFile);
      setDraft(loadedFile.currentContent);
    } catch (err) {
      setError(err.response?.status === 404 ? 'File or repository not found.' : 'Could not load this file.');
    } finally {
      setLoading(false);
    }
  }, [ownerUsername, repoName, path]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setConflict(null);
    try {
      const { file: updated } = await updateFile(ownerUsername, repoName, {
        path,
        content: draft,
        version: file.version,
      });
      setFile(updated);
      setDraft(updated.currentContent);
      // Revision history may now be stale -- force a reload next time it's opened.
      setRevisions(null);
    } catch (err) {
      if (err.response?.status === 409) {
        // The server tells us exactly what it's holding now -- surface
        // that directly rather than making the user guess or blindly retry.
        setConflict(err.response.data.details || {});
      } else {
        setError(err.response?.data?.error || 'Could not save this file.');
      }
    } finally {
      setSaving(false);
    }
  }

  function acceptServerVersion() {
    if (!conflict) return;
    setFile((f) => ({ ...f, currentContent: conflict.currentContent, version: conflict.currentVersion }));
    setDraft(conflict.currentContent);
    setConflict(null);
  }

  async function toggleHistory() {
    setShowHistory((s) => !s);
    if (!revisions) {
      const { revisions: list } = await listFileRevisions(ownerUsername, repoName, path);
      setRevisions(list);
    }
  }

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
        <Link to={`/repos/${ownerUsername}/${repoName}`} className="muted">
          &larr; {ownerUsername}/{repoName}
        </Link>
        <h1 style={{ marginTop: 8, marginBottom: 4 }}>{path}</h1>
        <p className="muted">
          Version {file.version} &middot; last updated {new Date(file.updatedAt).toLocaleString()}
        </p>

        {conflict && (
          <div className="error-banner">
            This file changed on the server (now at version {conflict.currentVersion}) since you loaded it. Your
            edits below have <strong>not</strong> been saved.
            <div style={{ marginTop: 8 }}>
              <button className="btn-inline" onClick={acceptServerVersion}>
                Load latest version (discards your local edits)
              </button>
            </div>
          </div>
        )}

        {isOwner ? (
          <>
            <textarea
              rows={16}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ fontFamily: 'monospace', marginTop: 12 }}
            />
            <button style={{ maxWidth: 200 }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </>
        ) : (
          <pre className="code-block">{file.currentContent}</pre>
        )}

        <hr className="divider" />

        <button className="btn-inline" onClick={toggleHistory}>
          {showHistory ? 'Hide' : 'Show'} revision history
        </button>

        {showHistory && (
          <div style={{ marginTop: 12 }}>
            {!revisions && <p className="muted">Loading...</p>}
            {revisions && revisions.length === 0 && <p className="muted">No revisions yet.</p>}
            {revisions &&
              revisions.map((rev) => (
                <div key={rev._id} className="revision-row">
                  <button
                    className="btn-inline"
                    onClick={() => setExpandedRevision((id) => (id === rev._id ? null : rev._id))}
                  >
                    v{rev.version} by {rev.editedBy?.username || 'unknown'} &middot;{' '}
                    {new Date(rev.createdAt).toLocaleString()}
                  </button>
                  {expandedRevision === rev._id && <pre className="code-block">{rev.content}</pre>}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
