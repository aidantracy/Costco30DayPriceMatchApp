import * as SecureStore from 'expo-secure-store';

/** Where the refresh token lives between app launches. Access tokens stay in memory only. */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'refresh_token';

/** Android Keystore / iOS Keychain via expo-secure-store (NFR: tokens never in plain storage). */
export const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

export function memoryTokenStore(initial: string | null = null): TokenStore {
  let value = initial;
  return {
    get: async () => value,
    set: async (token) => {
      value = token;
    },
    clear: async () => {
      value = null;
    },
  };
}
