import { claimActions, STATUS_LABEL } from '../claims';

test('claim actions follow the allowed status moves', () => {
  expect(claimActions('flagged').map((a) => a.status)).toEqual(['claimed', 'dismissed']);
  expect(claimActions('claimed').map((a) => a.status)).toEqual(['refunded', 'denied']);
  expect(claimActions('refunded')).toEqual([]);
  expect(claimActions('denied')).toEqual([]);
  expect(claimActions('dismissed')).toEqual([]);
  expect(Object.keys(STATUS_LABEL)).toHaveLength(5);
});
