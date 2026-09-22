const BASE_URL = process.env.REACT_APP_API_URL || '';
const TIMEOUT_MS = 120_000; // 120 s — LLM calls can be slow but shouldn't hang forever

/** fetch() with a hard timeout. Throws a readable error on timeout or network failure. */
async function fetchWithTimeout(url, options = {}) {
  if (!BASE_URL) {
    throw new Error('REACT_APP_API_URL is not configured. Copy .env.example to .env and restart the frontend server.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — the backend is taking too long to respond. It may be busy or unresponsive.');
    }
    throw new Error(`Network error — could not reach the backend (${err.message}). Is it running?`);
  } finally {
    clearTimeout(timer);
  }
}

export const getToken = () => localStorage.getItem('lipi_token');

const authHeaders = (extra = {}) => ({
  'Authorization': `Bearer ${getToken()}`,
  ...extra,
});

// ── Auth ──────────────────────────────────────────────────────
export async function login(email, password) {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetchWithTimeout(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Invalid email or password');
  const data = await res.json();
  localStorage.setItem('lipi_token', data.access_token);
  return data;
}

export async function register(email, password) {
  const res = await fetchWithTimeout(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Registration failed');
  }
  return res.json();
}

export function logout() {
  localStorage.removeItem('lipi_token');
}

// ── Documents ─────────────────────────────────────────────────
export async function fetchDocuments() {
  const res = await fetchWithTimeout(`${BASE_URL}/documents`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load documents');
  return res.json();
}

export async function uploadDocument(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchWithTimeout(`${BASE_URL}/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json(); // { document_id, filename, cloud_url, page_count, chunk_count }
}

export async function deleteDocument(documentId) {
  const res = await fetchWithTimeout(`${BASE_URL}/documents/${documentId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete document');
  return res.json();
}

export async function fetchDocumentFile(documentId, versionId) {
  const query = versionId ? `?version_id=${encodeURIComponent(versionId)}` : '';
  const res = await fetchWithTimeout(`${BASE_URL}/documents/${documentId}/file${query}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load PDF from cloud storage');
  return res.blob();
}

export async function fetchAnnotations(documentId) {
  const res = await fetchWithTimeout(`${BASE_URL}/documents/${documentId}/annotations`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load annotations');
  return res.json();
}

export async function createAnnotation(documentId, annotation) {
  const res = await fetchWithTimeout(`${BASE_URL}/documents/${documentId}/annotations`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(annotation),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to save annotation');
  }
  return res.json();
}

export async function deleteAnnotation(documentId, annotationId) {
  const res = await fetchWithTimeout(`${BASE_URL}/documents/${documentId}/annotations/${annotationId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete annotation');
}

export async function updateAnnotation(documentId, annotationId, update) {
  const res = await fetchWithTimeout(`${BASE_URL}/documents/${documentId}/annotations/${annotationId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(update),
  });
  if (!res.ok) throw new Error('Failed to update annotation');
  return res.json();
}

export async function exportAnnotations(documentId) {
  const res = await fetchWithTimeout(`${BASE_URL}/documents/${documentId}/export`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to export annotated PDF');
  }
  return res.json();
}

export async function fetchDocumentVersions(documentId) {
  const res = await fetchWithTimeout(`${BASE_URL}/documents/${documentId}/versions`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load document versions');
  return res.json();
}

export async function fetchUsage() {
  const res = await fetchWithTimeout(`${BASE_URL}/usage`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load usage');
  return res.json();
}

// ── Chat ──────────────────────────────────────────────────────
/** List all chat sessions for the current user, optionally filtered by documentId. */
export async function fetchChatSessions(documentId) {
  const url = documentId
    ? `${BASE_URL}/chat/sessions?document_id=${encodeURIComponent(documentId)}`
    : `${BASE_URL}/chat/sessions`;
  const res = await fetchWithTimeout(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load chat sessions');
  return res.json(); // [{ id, document_id, title, created_at, updated_at }, ...]
}

/** Fetch all messages belonging to a chat session (ordered oldest→newest). */
export async function fetchSessionMessages(sessionId) {
  const res = await fetchWithTimeout(`${BASE_URL}/chat/sessions/${sessionId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load session messages');
  return res.json(); // [{ id, session_id, role, content, created_at }, ...]
}

export async function createChatSession(documentId) {
  const res = await fetchWithTimeout(`${BASE_URL}/chat/sessions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ document_id: documentId, title: 'Chat' }),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json(); // { session_id, ... }
}

export async function querySession(sessionId, question) {
  const res = await fetchWithTimeout(`${BASE_URL}/chat/sessions/${sessionId}/query`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error('Query failed');
  return res.json(); // { answer, sources }
}
