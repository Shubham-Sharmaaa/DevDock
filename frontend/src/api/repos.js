import api from './client';

export async function createRepo(payload) {
  const { data } = await api.post('/repos', payload);
  return data;
}

export async function listMyRepos(params = {}) {
  const { data } = await api.get('/repos', { params });
  return data;
}

export async function getRepo(ownerUsername, repoName) {
  const { data } = await api.get(`/repos/${ownerUsername}/${repoName}`);
  return data;
}

export async function updateRepo(ownerUsername, repoName, payload) {
  const { data } = await api.patch(`/repos/${ownerUsername}/${repoName}`, payload);
  return data;
}

export async function deleteRepo(ownerUsername, repoName) {
  const { data } = await api.delete(`/repos/${ownerUsername}/${repoName}`);
  return data;
}

export async function starRepo(ownerUsername, repoName) {
  const { data } = await api.post(`/repos/${ownerUsername}/${repoName}/star`);
  return data;
}

export async function unstarRepo(ownerUsername, repoName) {
  const { data } = await api.delete(`/repos/${ownerUsername}/${repoName}/star`);
  return data;
}

export async function searchRepos(q, params = {}) {
  const { data } = await api.get('/repos/search', { params: { q, ...params } });
  return data;
}
