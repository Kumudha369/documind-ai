import axios from 'axios';

// withCredentials sends the httpOnly login cookie. The token never touches JavaScript.
export const api = axios.create({ baseURL: '/api', withCredentials: true });

// Turn any failure into a readable message.
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const e = err?.response?.data?.error;
  if (e?.details?.length) return `${e.message} ${e.details.map((d) => d.message).join(' ')}`.trim();
  if (e?.message) return e.message;
  if (err?.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the backend running?';
  return fallback;
}

export const fileUrl = (id) => `/api/documents/${id}/file`;
