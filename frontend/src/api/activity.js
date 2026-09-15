import api from './client';

export async function getMyActivity(params = {}) {
  const { data } = await api.get('/activity', { params });
  return data;
}
