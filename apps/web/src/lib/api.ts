const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(base + path, {
    method, credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'AutomationMonitor' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(typeof payload.message === 'string' ? payload.message : 'Request failed. Please try again.', response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
