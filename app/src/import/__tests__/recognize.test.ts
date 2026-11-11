const native = {
  recognize: jest.fn(async () => [
    { text: 'SUBTOTAL', left: 0, top: 10, right: 100, bottom: 30 },
    { text: '34.47', left: null, top: null, right: null, bottom: null },
  ]),
};

function load(available: boolean) {
  let mod: typeof import('../recognize') | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo', () => ({ requireOptionalNativeModule: () => (available ? native : null) }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs require
    mod = require('../recognize');
  });
  return mod!;
}

test('maps native lines to parser input, keeping boxes when present', async () => {
  const { canRecognize, recognize } = load(true);
  expect(canRecognize()).toBe(true);
  expect(await recognize('file:///shot.png')).toEqual([
    { text: 'SUBTOTAL', frame: { left: 0, top: 10, right: 100, bottom: 30 } },
    { text: '34.47' },
  ]);
  expect(native.recognize).toHaveBeenCalledWith('file:///shot.png');
});

test('explains that Expo Go lacks the native module', async () => {
  const { canRecognize, recognize } = load(false);
  expect(canRecognize()).toBe(false);
  await expect(recognize('file:///shot.png')).rejects.toThrow('full app build');
});
