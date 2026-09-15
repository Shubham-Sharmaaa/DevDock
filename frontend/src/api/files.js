import api from './client';

export async function listFiles(ownerUsername, repoName) {
  const { data } = await api.get(`/repos/${ownerUsername}/${repoName}/files`);
  return data;
}

export async function getFileContent(ownerUsername, repoName, path) {
  const { data } = await api.get(`/repos/${ownerUsername}/${repoName}/files/content`, { params: { path } });
  return data;
}

export async function listFileRevisions(ownerUsername, repoName, path, params = {}) {
  const { data } = await api.get(`/repos/${ownerUsername}/${repoName}/files/revisions`, {
    params: { path, ...params },
  });
  return data;
}

export async function createFile(ownerUsername, repoName, payload) {
  const { data } = await api.post(`/repos/${ownerUsername}/${repoName}/files`, payload);
  return data;
}

export async function updateFile(ownerUsername, repoName, payload) {
  const { data } = await api.put(`/repos/${ownerUsername}/${repoName}/files`, payload);
  return data;
}
