import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { FlagStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { shortDate } from '../dates';
import { formatCents } from '../money';
import type { DropsStackParams } from '../navigation';
import { claimActions, STATUS_LABEL } from '../purchases/claims';
import { Button, Card, Message } from '../ui/components';
import { colors, space } from '../ui/theme';
import { useLoad } from '../ui/useLoad';

type Props = NativeStackScreenProps<DropsStackParams, 'ClaimCard'>;

/** What to show the membership or help desk to get the difference refunded. */
export function ClaimCardScreen({ route }: Props) {
  const { api } = useAuth();
  const { flagId } = route.params;
  const load = useCallback(() => api.claimCard(flagId), [api, flagId]);
  const { data: card, error, loading, reload } = useLoad(load);
  const [busy, setBusy] = useState<FlagStatus | null>(null);

  useEffect(() => {
    void reload();
    api.updateFlag(flagId, { read: true }).catch(() => undefined);
  }, [api, flagId, reload]);

  async function move(status: FlagStatus) {
    setBusy(status);
    try {
      await api.updateFlag(flagId, { status });
      await reload();
    } catch (e) {
      Alert.alert("Couldn't update", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return null;
  if (!card) {
    return (
      <Message
        title="Couldn't load this claim"
        body={error ?? undefined}
        action={<Button title="Try again" variant="secondary" onPress={() => reload()} />}
      />
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.status}>{STATUS_LABEL[card.status]}</Text>
        <Text style={styles.refund}>{formatCents(card.refund_due_cents)}</Text>
        <Text style={styles.refundLabel}>
          refund due{card.eligible_quantity > 1 ? ` for ${card.eligible_quantity} items` : ''}
        </Text>
      </Card>
      <Card>
        <Row label="Item number" value={card.item_number} large />
        <Row label="Item" value={card.description} />
        <Row label="You paid (each)" value={formatCents(card.price_paid_cents)} />
        <Row label="Price now (each)" value={formatCents(card.current_price_cents)} />
        <Row label="Bought" value={`${shortDate(card.purchase_date)} · qty ${card.quantity}`} />
        {card.warehouse_number ? <Row label="Warehouse" value={`#${card.warehouse_number}`} /> : null}
        <Row label="Price seen" value={shortDate(card.price_seen_on)} />
        {card.promo_end ? <Row label="Sale ends" value={shortDate(card.promo_end)} /> : null}
        <Row label="Claim by" value={shortDate(card.claim_deadline)} strong />
      </Card>
      <Card>
        <Text style={styles.howTitle}>How to claim</Text>
        <Text style={styles.how}>{card.claim_path}</Text>
      </Card>
      {claimActions(card.status).map((a) => (
        <Button
          key={a.status}
          title={a.label}
          variant={a.status === 'claimed' || a.status === 'refunded' ? 'primary' : 'secondary'}
          busy={busy === a.status}
          disabled={busy !== null}
          onPress={() => move(a.status)}
        />
      ))}
    </ScrollView>
  );
}

function Row(props: { label: string; value: string; large?: boolean; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{props.label}</Text>
      <Text
        selectable
        style={[styles.rowValue, props.large && styles.large, props.strong && styles.strong]}
      >
        {props.value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: space.lg },
  status: { fontSize: 14, fontWeight: '600', color: colors.muted },
  refund: { fontSize: 40, fontWeight: '800', color: colors.success, marginTop: space.xs },
  refundLabel: { fontSize: 15, color: colors.muted },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 15, color: colors.muted, marginRight: space.md },
  rowValue: { fontSize: 15, color: colors.text, flexShrink: 1, textAlign: 'right' },
  large: { fontSize: 24, fontWeight: '700', letterSpacing: 1 },
  strong: { fontWeight: '700', color: colors.warning },
  howTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  how: { fontSize: 15, color: colors.text, lineHeight: 21 },
});
