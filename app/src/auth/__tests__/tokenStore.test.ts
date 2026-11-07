import * as SecureStore from 'expo-secure-store';

import { memoryTokenStore, secureTokenStore } from '../tokenStore';

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => values.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void values.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void values.delete(k)),
  };
});

test('secure store keeps the refresh token under one key', async () => {
  await secureTokenStore.set('refresh-1');
  expect(await secureTokenStore.get()).toBe('refresh-1');
  await secureTokenStore.clear();
  expect(await secureTokenStore.get()).toBeNull();
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'refresh-1');
});

test('memory store', async () => {
  const store = memoryTokenStore('a');
  expect(await store.get()).toBe('a');
  await store.set('b');
  expect(await store.get()).toBe('b');
  await store.clear();
  expect(await store.get()).toBeNull();
});
