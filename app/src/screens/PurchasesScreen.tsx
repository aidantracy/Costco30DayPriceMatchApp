import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/errors';
import type { Purchase } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { daysLeftLabel, shortDate } from '../dates';
import { formatCents } from '../money';
import type { PurchasesStackParams } from '../navigation';
import { Button, Message } from '../ui/components';
import { colors, space } from '../ui/theme';
import { useLoad } from '../ui/useLoad';

type Props = NativeStackScreenProps<PurchasesStackParams, 'Purchases'>;

export function PurchasesScreen({ navigation }: Props) {
  const { api } = useAuth();
  const load = useCallback(() => api.purchases('open'), [api]);
  const { data, error, loading, refreshing, reload } = useLoad(load);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  function confirmDelete(p: Purchase) {
    Alert.alert('Delete purchase?', `${p.description} will stop being tracked.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove(p, false),
      },
    ]);
  }

  async function remove(p: Purchase, confirm: boolean) {
    try {
      await api.deletePurchase(p.id, confirm);
      void reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        Alert.alert('This purchase has a claim', e.message, [
          { text: 'Keep it', style: 'cancel' },
          { text: 'Delete anyway', style: 'destructive', onPress: () => remove(p, true) },
        ]);
      } else {
        Alert.alert("Couldn't delete", (e as Error).message);
      }
    }
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => reload('refresh')} />
        }
        ListHeaderComponent={
          <View>
            <Button
              title="Import receipt screenshots"
              onPress={() => navigation.navigate('ImportReceipt')}
            />
            <Button
              title="Add a purchase by hand"
              variant="secondary"
              onPress={() => navigation.navigate('AddPurchase')}
            />
          </View>
        }
        ListEmptyComponent={
          loading ? undefined : error ? (
            <Message
              title="Couldn't load purchases"
              body={error}
              action={<Button title="Try again" variant="secondary" onPress={() => reload()} />}
            />
          ) : (
            <Message
              title="Nothing tracked yet"
              body="Import a receipt or add a purchase, and you'll get an alert if its price drops within 30 days."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => confirmDelete(item)}
            accessibilityHint="Long press to delete"
            style={styles.row}
          >
            <View style={styles.rowMain}>
              <Text style={styles.description} numberOfLines={1}>
                {item.description}
              </Text>
              <Text style={styles.meta}>
                #{item.item_number} · {item.quantity} × {formatCents(item.unit_price_cents)} ·{' '}
                {item.channel === 'warehouse' ? 'Warehouse' : 'Online'} ·{' '}
                {shortDate(item.purchase_date)}
              </Text>
            </View>
            <Text style={[styles.days, item.days_left <= 3 && styles.soon]}>
              {daysLeftLabel(item.days_left)}
            </Text>
          </Pressable>
        )}
      />
    </View>
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
    marginTop: space.sm,
  },
  rowMain: { flex: 1, marginRight: space.sm },
  description: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  days: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  soon: { color: colors.warning },
});
