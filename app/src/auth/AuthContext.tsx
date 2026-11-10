import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { createApiClient, type ApiClient } from '../api/client';
import { API_URL } from '../config';
import { secureTokenStore, type TokenStore } from './tokenStore';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  api: ApiClient;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider(props: {
  children: ReactNode;
  baseUrl?: string;
  tokens?: TokenStore;
  fetch?: typeof fetch;
}) {
  const [status, setStatus] = useState<Status>('loading');
  const { baseUrl = API_URL, tokens = secureTokenStore, fetch: fetchImpl } = props;
  const api = useMemo(
    () =>
      createApiClient({
        baseUrl,
        tokens,
        fetch: fetchImpl,
        onSignedOut: () => setStatus('signedOut'),
      }),
    [baseUrl, tokens, fetchImpl],
  );

  useEffect(() => {
    let active = true;
    api
      .restore()
      .then((ok) => active && setStatus(ok ? 'signedIn' : 'signedOut'))
      .catch(() => active && setStatus('signedOut'));
    return () => {
      active = false;
    };
  }, [api]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      api,
      async signIn(email, password) {
        await api.login(email, password);
        setStatus('signedIn');
      },
      async signOut() {
        await api.logout();
        setStatus('signedOut');
      },
    }),
    [api, status],
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
