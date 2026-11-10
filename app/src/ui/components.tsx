import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, space } from './theme';

export function Button(props: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const variant = props.variant ?? 'primary';
  const inactive = props.disabled || props.busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!props.busy }}
      disabled={inactive}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.dangerButton,
        (pressed || inactive) && styles.dim,
      ]}
    >
      {props.busy ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.primaryText} />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryText]}>
          {props.title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; error?: string; hint?: string }) {
  const { label, error, hint, style, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...input}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Card(props: { children: ReactNode }) {
  return <View style={styles.card}>{props.children}</View>;
}

export function Message(props: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageTitle}>{props.title}</Text>
      {props.body ? <Text style={styles.messageBody}>{props.body}</Text> : null}
      {props.action}
    </View>
  );
}

export function ErrorText(props: { children?: string | null }) {
  if (!props.children) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {props.children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    marginVertical: space.xs,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  dangerButton: { backgroundColor: colors.danger },
  dim: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
  secondaryText: { color: colors.primary },
  field: { marginBottom: space.md },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, marginTop: space.xs, fontSize: 14 },
  hint: { color: colors.muted, marginTop: space.xs, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  message: { padding: space.xl, alignItems: 'center' },
  messageTitle: { fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center' },
  messageBody: { fontSize: 15, color: colors.muted, textAlign: 'center', marginVertical: space.sm },
});
