import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { API_URL } from '../config';
import { Button, ErrorText, Field } from '../ui/components';
import { colors, space } from '../ui/theme';

export function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Price Match Tracker</Text>
        <Text style={styles.subtitle}>
          Sign in to track your Costco purchases for 30-day price adjustments.
        </Text>
        {!API_URL ? (
          <ErrorText>
            No server address is set. Add EXPO_PUBLIC_API_URL to app/.env.local and restart.
          </ErrorText>
        ) : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Sign in" onPress={submit} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: space.xl, paddingTop: 96 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted, marginTop: space.sm, marginBottom: space.xl },
});
