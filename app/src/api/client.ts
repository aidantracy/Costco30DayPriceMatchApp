import type { TokenStore } from '../auth/tokenStore';
import { ApiError, messageFrom, NetworkError, SignedOutError } from './errors';
import type {
  ClaimCard,
  Flag,
  FlagSummary,
  FlagUpdate,
  ManualPurchaseIn,
  ReceiptBatchIn,
  ReceiptBatchOut,
  ManualPurchaseOut,
  PriceBatchOut,
  PriceCheckResultIn,
  PriceIn,
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
/** Matches MAX_PRICES_PER_BATCH in the API. */
const PRICES_PER_REQUEST = 500;

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
    addPurchase: (body: ManualPurchaseIn) => request<ManualPurchaseOut>('POST', '/purchases', body),
    importReceipts: (body: ReceiptBatchIn) =>
      request<ReceiptBatchOut>('POST', '/purchases/batch', body),
    /** Report a receipt the phone couldn't read. Only the reason is sent, never the receipt. */
    reportUnreadable: (reason: string, parserVersion: string) =>
      request<unknown>('POST', '/review-items', {
        source: 'screenshot',
        reason: reason.slice(0, 200),
        parser_version: parserVersion,
      }),
    deletePurchase: (id: string, confirm = false) =>
      request<null>(
        'DELETE',
        `/purchases/${encodeURIComponent(id)}${confirm ? '?confirm=true' : ''}`,
      ),
    flags: () => request<Flag[]>('GET', '/flags'),
    claimCard: (flagId: string) =>
      request<ClaimCard>('GET', `/flags/${encodeURIComponent(flagId)}/claim-card`),
    updateFlag: (flagId: string, body: FlagUpdate) =>
      request<Flag>('PATCH', `/flags/${encodeURIComponent(flagId)}`, body),
    savings: () => request<Savings>('GET', '/savings'),
    /** Many prices at once, such as a Warehouse Savings list. Repeats are skipped. */
    // The API takes at most 500 prices per request, so longer lists go in several.
    recordPrices: async (prices: PriceIn[]): Promise<PriceBatchOut> => {
      const total: PriceBatchOut = { recorded: 0, duplicates: 0, flagged: [] };
      for (let i = 0; i < prices.length; i += PRICES_PER_REQUEST) {
        const part = await request<PriceBatchOut>('POST', '/prices/batch', {
          prices: prices.slice(i, i + PRICES_PER_REQUEST),
        });
        total.recorded += part.recorded;
        total.duplicates += part.duplicates;
        // A later, lower price for the same purchase replaces an earlier flag.
        const replaced = new Set(part.flagged.map((f) => f.purchase_id));
        total.flagged = [
          ...total.flagged.filter((f) => !replaced.has(f.purchase_id)),
          ...part.flagged,
        ];
      }
      return total;
    },
    /** Items to look up on costco.com now (ADR 0007). */
    priceChecksDue: async () =>
      (await request<{ item_numbers: string[] }>('GET', '/price-checks/due')).item_numbers,
    reportPriceCheck: (body: {
      started_at: string;
      finished_at: string;
      results: PriceCheckResultIn[];
    }) => request<{ recorded: number; flagged: FlagSummary[] }>('POST', '/price-checks', body),
    reportPriceCheckFailure: async (
      code: 'challenge' | 'network',
      startedAt: string,
      finishedAt: string,
    ) => {
      await request<null>('POST', '/sync-runs', {
        kind: 'price_check',
        status: 'failure',
        error_code: code,
        started_at: startedAt,
        finished_at: finishedAt,
      });
    },
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
