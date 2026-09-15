import api from './client';

export async function getUserProfile(username, params = {}) {
  const { data } = await api.get(`/users/${username}`, { params });
  return data;
}
