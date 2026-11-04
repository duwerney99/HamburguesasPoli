const API_URL = import.meta.env.VITE_API_URL || '/api';

export async function api(path, options = {}) {
  const token = localStorage.getItem('secret-bite-token');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No fue posible completar la solicitud.');
  return body;
}
