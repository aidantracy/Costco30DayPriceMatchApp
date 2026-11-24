import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { shortDate } from '../dates';
import { formatCents } from '../money';
import type { DropsStackParams } from '../navigation';
import { statusText, usePriceCheck } from '../prices/PriceCheckProvider';
import { STATUS_LABEL } from '../purchases/claims';
import { Button, Message } from '../ui/components';
import { colors, space } from '../ui/theme';
import { useLoad } from '../ui/useLoad';

type Props = NativeStackScreenProps<DropsStackParams, 'PriceDrops'>;

export function PriceDropsScreen({ navigation }: Props) {
  const { api } = useAuth();
  const load = useCallback(() => api.flags(), [api]);
  const { data, error, loading, refreshing, reload } = useLoad(load);
  const check = usePriceCheck();
  const line = statusText(check.status);
  const finished = check.status.state === 'idle' ? check.status.last : undefined;

  // Show drops found by a price check as soon as it finishes.
  useEffect(() => {
    if (finished) void reload();
  }, [finished, reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.list}
      data={data ?? []}
      keyExtractor={(f) => f.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void reload('refresh');
            void check.run(true);
          }}
        />
      }
      ListHeaderComponent={
        <View style={styles.status}>
          {line ? <Text style={styles.statusText}>{line}</Text> : null}
          {finished?.kind === 'needWarehouse' ? (
            <Button
              title="Choose your warehouse"
              variant="secondary"
              onPress={() => navigation.navigate('ChooseWarehouse')}
            />
          ) : null}
          <Button
            title="Read Warehouse Savings"
            variant="secondary"
            onPress={() => navigation.navigate('ReadSavings')}
          />
        </View>
      }
      ListEmptyComponent={
        loading ? undefined : error ? (
          <Message
            title="Couldn't load price drops"
            body={error}
            action={<Button title="Try again" variant="secondary" onPress={() => reload()} />}
          />
        ) : (
          <Message
            title="No price drops right now"
            body="Prices are checked on costco.com each day you open the app, and from the Costco app's Warehouse Savings when you read it. When something you bought gets cheaper within 30 days, it shows up here."
          />
        )
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('ClaimCard', { flagId: item.id })}
          style={styles.row}
        >
          {item.unread ? <View style={styles.dot} accessibilityLabel="New" /> : null}
          <View style={styles.rowMain}>
            <Text style={styles.description} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={styles.meta}>
              {STATUS_LABEL[item.status]} · claim by {shortDate(item.claim_deadline)}
            </Text>
          </View>
          <Text style={styles.amount}>{formatCents(item.refund_due_cents)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: space.lg, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginRight: space.sm },
  rowMain: { flex: 1, marginRight: space.sm },
  description: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 18, fontWeight: '700', color: colors.success },
  status: { marginBottom: space.md },
  statusText: { fontSize: 14, color: colors.muted },
});
