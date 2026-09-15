import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRepo } from '../api/repos';
import { getIssue, updateIssueStatus, listComments, createComment } from '../api/issues';

export default function IssueDetail() {
  const { ownerUsername, repoName, issueNumber } = useParams();
  const { user } = useAuth();

  const [isRepoOwner, setIsRepoOwner] = useState(false);
  const [issue, setIssue] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ isOwner }, { issue: loadedIssue }, { comments: loadedComments }] = await Promise.all([
        getRepo(ownerUsername, repoName),
        getIssue(ownerUsername, repoName, issueNumber),
        listComments(ownerUsername, repoName, issueNumber),
      ]);
      setIsRepoOwner(isOwner);
      setIssue(loadedIssue);
      setComments(loadedComments);
    } catch (err) {
      setError(err.response?.status === 404 ? 'Issue not found.' : 'Could not load this issue.');
    } finally {
      setLoading(false);
    }
  }, [ownerUsername, repoName, issueNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const canChangeStatus = issue && user && (isRepoOwner || issue.author.username === user.username);

  async function toggleStatus() {
    setStatusSubmitting(true);
    setError('');
    try {
      const newStatus = issue.status === 'open' ? 'closed' : 'open';
      const { issue: updated } = await updateIssueStatus(ownerUsername, repoName, issueNumber, newStatus);
      setIssue(updated);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update issue status.');
    } finally {
      setStatusSubmitting(false);
    }
  }

  async function handleCommentSubmit(e) {
    e.preventDefault();
    setCommentError('');
    setCommentSubmitting(true);
    try {
      const { comment } = await createComment(ownerUsername, repoName, issueNumber, commentBody);
      setComments((c) => [...c, comment]);
      setCommentBody('');
    } catch (err) {
      setCommentError(err.response?.data?.error || 'Could not post comment.');
    } finally {
      setCommentSubmitting(false);
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
        <Link to={`/repos/${ownerUsername}/${repoName}/issues`} className="muted">
          &larr; Issues
        </Link>

        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8, gap: 8 }}
        >
          <h1 style={{ margin: 0 }}>
            #{issue.number} {issue.title}
          </h1>
          <span className={`badge badge-${issue.status}`}>{issue.status}</span>
        </div>

        <p className="muted">opened by {issue.author.username}</p>

        {issue.labels.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {issue.labels.map((l) => (
              <span key={l} className="label-chip">
                {l}
              </span>
            ))}
          </div>
        )}

        {issue.description && <p style={{ whiteSpace: 'pre-wrap' }}>{issue.description}</p>}

        {canChangeStatus && (
          <button className="btn-inline" onClick={toggleStatus} disabled={statusSubmitting}>
            {statusSubmitting ? 'Updating...' : issue.status === 'open' ? 'Close issue' : 'Reopen issue'}
          </button>
        )}

        <hr className="divider" />

        <h2>Comments</h2>
        <div className="comment-list">
          {comments.length === 0 && <p className="muted">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c._id} className="comment">
              <div className="comment-header">
                <strong>{c.author.username}</strong>
                <span className="muted">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{c.body}</p>
            </div>
          ))}
        </div>

        {user ? (
          <form onSubmit={handleCommentSubmit} style={{ marginTop: 16 }}>
            <label htmlFor="comment">Add a comment</label>
            <textarea
              id="comment"
              rows={3}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              required
            />
            {commentError && <div className="error-banner">{commentError}</div>}
            <button type="submit" disabled={commentSubmitting}>
              {commentSubmitting ? 'Posting...' : 'Post comment'}
            </button>
          </form>
        ) : (
          <p className="muted" style={{ marginTop: 16 }}>
            <Link to="/login">Log in</Link> to comment.
          </p>
        )}
      </div>
    </div>
  );
}
