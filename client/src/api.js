const API_URL = import.meta.env?.VITE_API_URL || '/api';

export const ACCESS_TOKEN_KEY = 'secret-bite-token';
export const REFRESH_TOKEN_KEY = 'secret-bite-refresh-token';

let refreshPromise = null;
const inFlightGets = new Map();

function readStorage(key) {
  try {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
      ? localStorage.getItem(key)
      : null;
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, value);
    }
  } catch {
    /* ignore storage errors */
  }
}

function removeStorage(key) {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore storage errors */
  }
}

export function saveSessionTokens(data = {}) {
  const accessToken = data.accessToken || data.token;
  if (accessToken) writeStorage(ACCESS_TOKEN_KEY, accessToken);
  if (data.refreshToken) writeStorage(REFRESH_TOKEN_KEY, data.refreshToken);
}

export function clearSessionTokens() {
  removeStorage(ACCESS_TOKEN_KEY);
  removeStorage(REFRESH_TOKEN_KEY);
}

export function hasSessionTokens() {
  return Boolean(readStorage(ACCESS_TOKEN_KEY) || readStorage(REFRESH_TOKEN_KEY));
}

async function refreshAccessToken() {
  const refreshToken = readStorage(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        if (!response.ok) {
          clearSessionTokens();
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('secret-bite:session-expired'));
          }
          return null;
        }
        const data = await response.json().catch(() => ({}));
        saveSessionTokens(data);
        return data.accessToken || data.token || null;
      } catch {
        clearSessionTokens();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

export async function logoutSession() {
  const accessToken = readStorage(ACCESS_TOKEN_KEY);
  const refreshToken = readStorage(REFRESH_TOKEN_KEY);
  clearSessionTokens();
  if (!accessToken && !refreshToken) return;
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({ refreshToken: refreshToken || undefined })
    });
  } catch {
    /* ignore network error on logout */
  }
}

async function executeRequest(path, options = {}, _retried = false) {
  let token = readStorage(ACCESS_TOKEN_KEY);
  const isAuthEndpoint =
    path === '/auth/login' || path === '/auth/register' || path === '/auth/refresh';

  if (!token && !isAuthEndpoint && readStorage(REFRESH_TOKEN_KEY)) {
    token = await refreshAccessToken();
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (response.status === 401 && !_retried && !isAuthEndpoint && readStorage(REFRESH_TOKEN_KEY)) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      return executeRequest(path, options, true);
    }
  }

  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No fue posible completar la solicitud.');
  return body;
}

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    return executeRequest(path, options);
  }

  const key = `${path}::${readStorage(ACCESS_TOKEN_KEY) || ''}`;
  if (inFlightGets.has(key)) {
    return inFlightGets.get(key);
  }

  const requestPromise = executeRequest(path, options).finally(() => {
    inFlightGets.delete(key);
  });
  inFlightGets.set(key, requestPromise);
  return requestPromise;
}
