import { act, renderHook, waitFor } from '@testing-library/react-native';

import { SignedOutError } from '../../api/errors';
import { useLoad } from '../useLoad';

test('loads, refreshes and reports errors', async () => {
  let n = 0;
  const load = jest.fn(async () => {
    n += 1;
    if (n === 2) throw new Error('offline');
    return n;
  });
  const { result } = await renderHook(() => useLoad(load));
  expect(result.current.loading).toBe(true);

  await act(() => result.current.reload());
  expect(result.current).toMatchObject({ data: 1, loading: false, error: null });

  await act(() => result.current.reload('refresh'));
  expect(result.current).toMatchObject({ data: 1, error: 'offline', refreshing: false });

  await act(() => result.current.reload());
  await waitFor(() => expect(result.current.data).toBe(3));
  expect(result.current.error).toBeNull();
});

test('a signed-out error shows no message', async () => {
  const { result } = await renderHook(() =>
    useLoad(async () => {
      throw new SignedOutError();
    }),
  );
  await act(() => result.current.reload());
  expect(result.current.error).toBeNull();
});

test('results after unmount are ignored', async () => {
  let resolve: (v: number) => void = () => undefined;
  const { result, unmount } = await renderHook(() =>
    useLoad(() => new Promise<number>((r) => (resolve = r))),
  );
  const pending = result.current.reload();
  unmount();
  resolve(5);
  await pending;
});
