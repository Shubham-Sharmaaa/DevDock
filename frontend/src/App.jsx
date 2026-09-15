import { Routes, Route, Navigate, Link } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NewRepository from './pages/NewRepository';
import RepositoryOverview from './pages/RepositoryOverview';
import NewFile from './pages/NewFile';
import FileEditor from './pages/FileEditor';
import IssueList from './pages/IssueList';
import NewIssue from './pages/NewIssue';
import IssueDetail from './pages/IssueDetail';
import SearchResults from './pages/SearchResults';
import UserProfile from './pages/UserProfile';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <>
      <div className="topbar">
        <Link to="/" className="brand">
          DevDock
        </Link>
      </div>

      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Public: viewable by anyone, subject to the repo's own visibility
            rule enforced server-side -- not gated by ProtectedRoute, since
            logged-out visitors must be able to see public repos/files/issues. */}
        <Route path="/repos/:ownerUsername/:repoName" element={<RepositoryOverview />} />
        <Route path="/repos/:ownerUsername/:repoName/file" element={<FileEditor />} />
        <Route path="/repos/:ownerUsername/:repoName/issues" element={<IssueList />} />
        <Route path="/repos/:ownerUsername/:repoName/issues/:issueNumber" element={<IssueDetail />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/users/:username" element={<UserProfile />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/new" element={<NewRepository />} />
          <Route path="/repos/:ownerUsername/:repoName/files/new" element={<NewFile />} />
          <Route path="/repos/:ownerUsername/:repoName/issues/new" element={<NewIssue />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
