import type { ApiErrorBody, LoginResponse } from '@lams/shared';
import { setServerState } from './serverStatus';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let onSessionLost: () => void = () => {};

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function onSessionExpired(handler: () => void): void {
  onSessionLost = handler;
}

/** Gateway errors and network failures while the free-tier server is starting up. */
const WAKE_STATUSES = new Set([502, 503, 504]);
/** Render's free tier usually wakes in 30–60 s; give it a little longer before giving up. */
const WAKE_BUDGET_MS = 100_000;
const SLOW_MS = 2_500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch that rides out a cold start: retries with backoff while the server wakes, and flips the
 * global server state so the banner appears only if the wait is noticeable.
 */
async function fetchWithWake(url: string, init: RequestInit): Promise<Response> {
  const started = Date.now();
  const slowTimer = setTimeout(() => setServerState('waking'), SLOW_MS);
  let delay = 1_500;
  try {
    for (;;) {
      try {
        const res = await fetch(url, init);
        if (!WAKE_STATUSES.has(res.status) || Date.now() - started > WAKE_BUDGET_MS) {
          setServerState(WAKE_STATUSES.has(res.status) ? 'unreachable' : 'ok');
          return res;
        }
      } catch (err) {
        if (Date.now() - started > WAKE_BUDGET_MS) {
          setServerState('unreachable');
          throw err;
        }
      }
      setServerState('waking');
      await sleep(delay);
      delay = Math.min(delay * 1.5, 8_000);
    }
  } finally {
    clearTimeout(slowTimer);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error, e.g. an HTML gateway page */
  }
  const e = body.error;
  return new ApiError(res.status, e?.code ?? 'HTTP_' + res.status, e?.message ?? res.statusText, e?.requestId, e?.details);
}

let refreshing: Promise<LoginResponse | null> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Single-flight within a tab, and
 * serialised across tabs with the Web Locks API so two tabs never rotate the same token.
 */
export function refreshSession(): Promise<LoginResponse | null> {
  refreshing ??= (async () => {
    const run = async () => {
      const res = await fetchWithWake('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = (await res.json()) as LoginResponse;
      setAccessToken(data.accessToken);
      return data;
    };
    try {
      return navigator.locks ? await navigator.locks.request('lams-refresh', run) : await run();
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  const send = () =>
    fetchWithWake(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && accessToken) {
    // Access tokens last 15 minutes; renew once transparently, then give up.
    const renewed = await refreshSession();
    if (renewed) res = await send();
    else {
      setAccessToken(null);
      onSessionLost();
    }
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
