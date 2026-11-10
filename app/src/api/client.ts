import type { TokenStore } from '../auth/tokenStore';
import { ApiError, messageFrom, NetworkError, SignedOutError } from './errors';
import type {
  ClaimCard,
  Flag,
  FlagUpdate,
  ManualPurchaseIn,
  ManualPurchaseOut,
  Me,
  Purchase,
  Savings,
  Tokens,
} from './types';

type Fetch = typeof fetch;
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetch?: Fetch;
  timeoutMs?: number;
  /** Called once when the session can't be renewed, so the app can show sign-in. */
  onSignedOut?: () => void;
}

/**
 * Talks to the backend. The access token is kept in memory; the refresh token is in
 * secure storage. A 401 triggers one refresh (shared by concurrent requests) and a retry.
 */
export function createApiClient(options: ClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch: Fetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let accessToken: string | null = null;
  let refreshing: Promise<boolean> | null = null;

  async function send(method: Method, path: string, body?: unknown, auth = true) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }

  async function parse<T>(response: Response): Promise<T> {
    const text = await response.text();
    const data: unknown = text ? safeJson(text) : null;
    if (!response.ok) throw new ApiError(response.status, messageFrom(response.status, data));
    return data as T;
  }

  async function saveTokens(t: Tokens) {
    accessToken = t.access_token;
    await options.tokens.set(t.refresh_token);
  }

  async function signOutLocally() {
    accessToken = null;
    await options.tokens.clear();
  }

  /** Exchange the stored refresh token for new tokens. False when there's no session. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const stored = await options.tokens.get();
        if (!stored) return false;
        const response = await send('POST', '/auth/refresh', { refresh_token: stored }, false);
        if (response.status === 401) {
          await signOutLocally();
          return false;
        }
        await saveTokens(await parse<Tokens>(response));
        return true;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    if (!accessToken && !(await refresh())) {
      options.onSignedOut?.();
      throw new SignedOutError();
    }
    let response = await send(method, path, body);
    if (response.status === 401) {
      if (!(await refresh())) {
        options.onSignedOut?.();
        throw new SignedOutError();
      }
      response = await send(method, path, body);
    }
    return parse<T>(response);
  }

  return {
    /** Restore a session from secure storage at app launch. */
    restore: () => refresh(),
    async login(email: string, password: string): Promise<void> {
      const response = await send('POST', '/auth/login', { email: email.trim(), password }, false);
      await saveTokens(await parse<Tokens>(response));
    },
    async logout(): Promise<void> {
      const stored = await options.tokens.get();
      try {
        if (stored) await send('POST', '/auth/logout', { refresh_token: stored });
      } catch {
        // Signing out locally still matters when the server is unreachable.
      } finally {
        await signOutLocally();
      }
    },
    me: () => request<Me>('GET', '/me'),
    purchases: (status: 'open' | 'expired' | 'excluded' | 'all' = 'open') =>
      request<Purchase[]>('GET', `/purchases?status=${status}`),
    addPurchase: (body: ManualPurchaseIn) =>
      request<ManualPurchaseOut>('POST', '/purchases', body),
    deletePurchase: (id: string, confirm = false) =>
      request<null>('DELETE', `/purchases/${encodeURIComponent(id)}${confirm ? '?confirm=true' : ''}`),
    flags: () => request<Flag[]>('GET', '/flags'),
    claimCard: (flagId: string) =>
      request<ClaimCard>('GET', `/flags/${encodeURIComponent(flagId)}/claim-card`),
    updateFlag: (flagId: string, body: FlagUpdate) =>
      request<Flag>('PATCH', `/flags/${encodeURIComponent(flagId)}`, body),
    savings: () => request<Savings>('GET', '/savings'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
