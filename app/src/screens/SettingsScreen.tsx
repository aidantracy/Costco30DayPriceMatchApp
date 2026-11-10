import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { formatCents } from '../money';
import { Button, Card } from '../ui/components';
import { colors, space } from '../ui/theme';
import { useLoad } from '../ui/useLoad';

export function SettingsScreen() {
  const { api, signOut } = useAuth();
  const load = useCallback(async () => ({ me: await api.me(), savings: await api.savings() }), [api]);
  const { data, reload } = useLoad(load);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.label}>Saved so far</Text>
        <Text style={styles.total}>
          {data ? formatCents(data.savings.total_refunded_cents) : '—'}
        </Text>
        {data?.savings.alert_accuracy != null ? (
          <Text style={styles.muted}>
            {Math.round(data.savings.alert_accuracy * 100)}% of decided claims were refunded
          </Text>
        ) : null}
      </Card>
      <Card>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{data?.me.email ?? '—'}</Text>
        <Text style={styles.label}>Time zone</Text>
        <Text style={styles.value}>{data?.me.time_zone ?? '—'}</Text>
      </Card>
      <Button
        title="Sign out"
        variant="secondary"
        busy={busy}
        onPress={async () => {
          setBusy(true);
          await signOut();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: space.lg },
  label: { fontSize: 13, color: colors.muted, marginTop: space.xs },
  value: { fontSize: 16, color: colors.text, marginBottom: space.sm },
  total: { fontSize: 32, fontWeight: '800', color: colors.success },
  muted: { fontSize: 14, color: colors.muted },
});
