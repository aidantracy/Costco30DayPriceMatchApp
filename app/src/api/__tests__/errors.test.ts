import { messageFrom } from '../errors';

test.each([
  [409, { detail: 'Already have it' }, 'Already have it'],
  [422, { detail: [{ loc: ['body', 'item_number'], msg: 'String should match pattern' }] }, 'item number: String should match pattern'],
  [422, { detail: [{ loc: 'body', msg: 'Bad value' }] }, 'Bad value'],
  [422, { detail: [{}] }, 'Something went wrong (422). Try again.'],
  [429, null, 'Too many attempts. Wait a few minutes and try again.'],
  [404, { detail: '' }, 'That item no longer exists.'],
  [500, 'text', 'Something went wrong (500). Try again.'],
])('status %s → message', (status, body, expected) => {
  expect(messageFrom(status, body)).toBe(expected);
});
