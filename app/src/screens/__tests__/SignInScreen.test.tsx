import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { fakeFetch, TOKENS } from '../../api/__fixtures__/fakeServer';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { memoryTokenStore } from '../../auth/tokenStore';
import { SignInScreen } from '../SignInScreen';

jest.mock('../../config', () => ({ API_URL: 'https://api.example.test' }));

function Gate() {
  const { status } = useAuth();
  if (status === 'loading') return <Text>Loading</Text>;
  return status === 'signedIn' ? <Text>Signed in</Text> : <SignInScreen />;
}

async function setup(stored: string | null = null) {
  const server = fakeFetch({
    'POST /auth/refresh': () => ({ status: 200, body: TOKENS(1) }),
    'POST /auth/login': (body) =>
      (body as { password: string }).password === 'correct horse battery'
        ? { status: 200, body: TOKENS(2) }
        : { status: 401, body: { detail: 'Email or password is incorrect' } },
  });
  const tokens = memoryTokenStore(stored);
  await render(
    <AuthProvider baseUrl="https://api.example.test" tokens={tokens} fetch={server.fetch}>
      <Gate />
    </AuthProvider>,
  );
  return { tokens };
}

test('asks for both fields before calling the server', async () => {
  await setup();
  await screen.findByText('Sign in', { exact: true });
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByText('Enter your email and password.')).toBeTruthy();
});

test('shows the server message for a wrong password, then signs in', async () => {
  const { tokens } = await setup();
  await fireEvent.changeText(await screen.findByLabelText('Email'), 'owner@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Email or password is incorrect')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse battery');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Signed in')).toBeTruthy();
  expect(await tokens.get()).toBe('refresh-2');
});

test('a stored session skips the sign-in screen', async () => {
  await setup('refresh-0');
  await waitFor(() => expect(screen.getByText('Signed in')).toBeTruthy());
});
