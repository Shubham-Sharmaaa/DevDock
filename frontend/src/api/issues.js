import api from './client';

export async function listIssues(ownerUsername, repoName, params = {}) {
  const { data } = await api.get(`/repos/${ownerUsername}/${repoName}/issues`, { params });
  return data;
}

export async function getIssue(ownerUsername, repoName, number) {
  const { data } = await api.get(`/repos/${ownerUsername}/${repoName}/issues/${number}`);
  return data;
}

export async function createIssue(ownerUsername, repoName, payload) {
  const { data } = await api.post(`/repos/${ownerUsername}/${repoName}/issues`, payload);
  return data;
}

export async function updateIssueStatus(ownerUsername, repoName, number, status) {
  const { data } = await api.patch(`/repos/${ownerUsername}/${repoName}/issues/${number}`, { status });
  return data;
}

export async function listComments(ownerUsername, repoName, number, params = {}) {
  const { data } = await api.get(`/repos/${ownerUsername}/${repoName}/issues/${number}/comments`, { params });
  return data;
}

export async function createComment(ownerUsername, repoName, number, body) {
  const { data } = await api.post(`/repos/${ownerUsername}/${repoName}/issues/${number}/comments`, { body });
  return data;
}
