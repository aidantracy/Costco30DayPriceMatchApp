/** A tiny in-memory stand-in for the API, for client and screen tests. Invented data only. */
export type Handler = (body: unknown, headers: Record<string, string>) => { status: number; body?: unknown };

export function fakeFetch(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; auth?: string; body?: unknown }[] = [];
  const impl = async (url: string, init: RequestInit = {}) => {
    const path = url.replace('https://api.example.test', '');
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, auth: headers.Authorization, body });
    const handler = routes[`${method} ${path}`];
    const result = handler ? handler(body, headers) : { status: 404, body: { detail: 'Not found' } };
    const text = result.body === undefined ? '' : JSON.stringify(result.body);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      text: async () => text,
    } as Response;
  };
  return { fetch: impl as unknown as typeof fetch, calls };
}

export const TOKENS = (n: number) => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  token_type: 'bearer',
  expires_in: 900,
});
