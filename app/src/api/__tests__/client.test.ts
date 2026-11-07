import { memoryTokenStore } from '../../auth/tokenStore';
import { createApiClient } from '../client';
import { ApiError, NetworkError, SignedOutError } from '../errors';
import { fakeFetch, TOKENS } from '../__fixtures__/fakeServer';

const BASE = 'https://api.example.test/';

function setup(routes: Parameters<typeof fakeFetch>[0], stored: string | null = null) {
  const server = fakeFetch(routes);
  const tokens = memoryTokenStore(stored);
  const onSignedOut = jest.fn();
  const api = createApiClient({ baseUrl: BASE, tokens, fetch: server.fetch, onSignedOut });
  return { api, tokens, onSignedOut, calls: server.calls };
}

test('login stores the refresh token and sends the access token', async () => {
  const { api, tokens, calls } = setup({
    'POST /auth/login': () => ({ status: 200, body: TOKENS(1) }),
    'GET /me': (_b, h) => ({ status: h.Authorization === 'Bearer access-1' ? 200 : 401, body: { email: 'a@example.com' } }),
  });
  await api.login('  owner@example.com ', 'pw');
  expect(await tokens.get()).toBe('refresh-1');
  expect(calls[0].body).toEqual({ email: 'owner@example.com', password: 'pw' });
  expect((await api.me()).email).toBe('a@example.com');
});

test('bad credentials surface the server message', async () => {
  const { api } = setup({
    'POST /auth/login': () => ({ status: 401, body: { detail: 'Email or password is incorrect' } }),
  });
  await expect(api.login('x@example.com', 'bad')).rejects.toEqual(
    new ApiError(401, 'Email or password is incorrect'),
  );
});

test('restore uses the stored refresh token', async () => {
  const { api, tokens } = setup(
    { 'POST /auth/refresh': (b) => ({ status: (b as { refresh_token: string }).refresh_token === 'refresh-0' ? 200 : 401, body: TOKENS(2) }) },
    'refresh-0',
  );
  expect(await api.restore()).toBe(true);
  expect(await tokens.get()).toBe('refresh-2');
});

test('restore without a stored token is signed out', async () => {
  const { api, calls } = setup({});
  expect(await api.restore()).toBe(false);
  expect(calls).toHaveLength(0);
});

test('an expired access token is refreshed once and the request retried', async () => {
  let issued = 0;
  const { api, calls } = setup(
    {
      'POST /auth/refresh': () => ({ status: 200, body: TOKENS(++issued) }),
      'GET /flags': (_b, h) =>
        h.Authorization === 'Bearer access-2' ? { status: 200, body: [] } : { status: 401 },
    },
    'refresh-0',
  );
  await api.restore(); // holds access-1, which the server now rejects
  const results = await Promise.all([api.flags(), api.flags()]);
  expect(results).toEqual([[], []]);
  // One refresh at launch, one shared by both concurrent 401s.
  expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(2);
});

test('a revoked session clears storage and reports sign-out', async () => {
  const { api, tokens, onSignedOut } = setup(
    {
      'POST /auth/refresh': () => ({ status: 401, body: { detail: 'revoked' } }),
    },
    'refresh-1',
  );
  await expect(api.purchases()).rejects.toBeInstanceOf(SignedOutError);
  expect(await tokens.get()).toBeNull();
  expect(onSignedOut).toHaveBeenCalledTimes(1);
});

test('401 after refresh succeeded but retry still rejected reports sign-out', async () => {
  const { api, onSignedOut } = setup(
    {
      'POST /auth/refresh': () => ({ status: 200, body: TOKENS(5) }),
      'GET /me': () => ({ status: 401 }),
    },
    'refresh-1',
  );
  await api.restore();
  // refresh keeps succeeding, so the retried 401 is returned as an error, not a loop
  await expect(api.me()).rejects.toEqual(new ApiError(401, 'Email or password is incorrect.'));
  expect(onSignedOut).not.toHaveBeenCalled();
});

test('a 401 whose refresh fails signs out', async () => {
  let refreshOk = true;
  const { api, onSignedOut } = setup(
    {
      'POST /auth/refresh': () => (refreshOk ? { status: 200, body: TOKENS(1) } : { status: 401 }),
      'GET /me': () => ({ status: 401 }),
    },
    'refresh-0',
  );
  await api.restore();
  refreshOk = false;
  await expect(api.me()).rejects.toBeInstanceOf(SignedOutError);
  expect(onSignedOut).toHaveBeenCalledTimes(1);
});

test('network failures become a NetworkError', async () => {
  const api = createApiClient({
    baseUrl: BASE,
    tokens: memoryTokenStore(),
    fetch: (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch,
  });
  await expect(api.login('a@example.com', 'pw')).rejects.toBeInstanceOf(NetworkError);
});

test('requests time out', async () => {
  jest.useFakeTimers();
  const api = createApiClient({
    baseUrl: BASE,
    tokens: memoryTokenStore(),
    timeoutMs: 50,
    fetch: ((_u: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch,
  });
  const pending = api.login('a@example.com', 'pw');
  jest.advanceTimersByTime(60);
  await expect(pending).rejects.toBeInstanceOf(NetworkError);
  jest.useRealTimers();
});

test('endpoints use the right methods, paths and bodies', async () => {
  const ok = (body: unknown = {}) => () => ({ status: 200, body });
  const { api, calls } = setup(
    {
      'POST /auth/refresh': ok(TOKENS(1)),
      'GET /purchases?status=expired': ok([]),
      'POST /purchases': () => ({ status: 201, body: { purchase: {}, already_cheaper: null } }),
      'DELETE /purchases/p%201': () => ({ status: 204 }),
      'DELETE /purchases/p1?confirm=true': () => ({ status: 204 }),
      'GET /flags/f1/claim-card': ok({ flag_id: 'f1' }),
      'PATCH /flags/f1': ok({ id: 'f1' }),
      'GET /savings': ok({ total_refunded_cents: 0 }),
    },
    'refresh-0',
  );
  await api.purchases('expired');
  await api.addPurchase({
    channel: 'online',
    item_number: '1234567',
    description: 'EXAMPLE',
    quantity: 1,
    unit_price_cents: 1999,
    purchase_date: '2026-10-01',
  });
  expect(await api.deletePurchase('p 1')).toBeNull();
  await api.deletePurchase('p1', true);
  expect((await api.claimCard('f1')).flag_id).toBe('f1');
  await api.updateFlag('f1', { read: true });
  await api.savings();
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
    'POST /auth/refresh',
    'GET /purchases?status=expired',
    'POST /purchases',
    'DELETE /purchases/p%201',
    'DELETE /purchases/p1?confirm=true',
    'GET /flags/f1/claim-card',
    'PATCH /flags/f1',
    'GET /savings',
  ]);
  expect(calls[6].body).toEqual({ read: true });
});

test('logout revokes on the server and always clears locally', async () => {
  const { api, tokens, calls } = setup({ 'POST /auth/logout': () => ({ status: 204 }) }, 'refresh-9');
  await api.logout();
  expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/logout', body: { refresh_token: 'refresh-9' } });
  expect(await tokens.get()).toBeNull();

  const offline = createApiClient({
    baseUrl: BASE,
    tokens: memoryTokenStore('refresh-1'),
    fetch: (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch,
  });
  await expect(offline.logout()).resolves.toBeUndefined();

  const nothingStored = setup({});
  await nothingStored.api.logout();
  expect(nothingStored.calls).toHaveLength(0);
});

test('non-JSON error bodies fall back to a generic message', async () => {
  const api = createApiClient({
    baseUrl: BASE,
    tokens: memoryTokenStore(),
    fetch: (async () => ({ ok: false, status: 502, text: async () => '<html>bad gateway</html>' })) as unknown as typeof fetch,
  });
  await expect(api.login('a@example.com', 'pw')).rejects.toEqual(
    new ApiError(502, 'Something went wrong (502). Try again.'),
  );
});
