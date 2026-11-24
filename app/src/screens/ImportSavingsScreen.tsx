import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { shortDate, todayIso } from '../dates';
import { canRecognize, recognize } from '../import/recognize';
import { currentOffers, readSavingsScreenshots, seenOn, toPrices } from '../import/savings';
import { formatCents } from '../money';
import type { DropsStackParams } from '../navigation';
import type { ParsedSavings, SavingsOffer } from '../parsing/warehouseSavings';
import { Button, Card, ErrorText, Message } from '../ui/components';
import { colors, space } from '../ui/theme';

type Props = NativeStackScreenProps<DropsStackParams, 'ImportSavings'>;

type Step =
  | { kind: 'start' }
  | { kind: 'reading'; done: number; total: number }
  | { kind: 'review'; savings: ParsedSavings };

export function ImportSavingsScreen({ navigation }: Props) {
  const { api } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 30,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    try {
      const shots = [];
      for (const [i, asset] of result.assets.entries()) {
        setStep({ kind: 'reading', done: i, total: result.assets.length });
        shots.push(await recognize(asset.uri));
      }
      setStep({ kind: 'review', savings: readSavingsScreenshots(shots) });
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: 'start' });
    }
  }

  async function save(savings: ParsedSavings, offers: SavingsOffer[]) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.recordPrices(toPrices(savings, offers, todayIso()));
      const parts = [`Saved ${result.recorded} price${result.recorded === 1 ? '' : 's'}.`];
      if (result.duplicates) parts.push(`${result.duplicates} were already saved.`);
      if (result.flagged.length === 0) {
        parts.push('Nothing you bought in the last 30 days is on this list at a lower price.');
      }
      for (const f of result.flagged) {
        parts.push(
          `${f.description}: get ${formatCents(f.refund_due_cents)} back by ${shortDate(f.claim_deadline)}.`,
        );
      }
      Alert.alert('Warehouse Savings imported', parts.join('\n'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canRecognize()) {
    return (
      <Message
        title="Needs the full app build"
        body="Reading screenshots uses on-device text recognition, which Expo Go can't run. Install the full app build to use this."
      />
    );
  }

  if (step.kind === 'reading') {
    return (
      <Message
        title={`Reading screenshot ${step.done + 1} of ${step.total}…`}
        body="Text is read on your phone. The screenshots aren't uploaded."
      />
    );
  }

  if (step.kind === 'start') {
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <Card>
          <Text style={styles.title}>Import Warehouse Savings</Text>
          <Text style={styles.body}>
            Most groceries aren&apos;t on costco.com, so their sale prices come from the Costco app
            instead.
          </Text>
          <Text style={styles.body}>
            1. In the Costco app, open Warehouse → Warehouse Savings and tap See All Savings.
          </Text>
          <Text style={styles.body}>
            2. Take screenshots while scrolling down, overlapping a little so no item is cut off.
          </Text>
          <Text style={styles.body}>3. Pick them here. Any order works.</Text>
        </Card>
        <ErrorText>{error}</ErrorText>
        <Button title="Choose screenshots" onPress={pick} />
      </ScrollView>
    );
  }

  const { savings } = step;
  const today = todayIso();
  const offers = currentOffers(savings, today);
  const ended = savings.offers.length - offers.length;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.title}>
          {offers.length} offer{offers.length === 1 ? '' : 's'} · seen{' '}
          {shortDate(seenOn(savings, today))}
        </Text>
        {offers.length === 0 ? (
          <Text style={styles.problem}>
            No offers were found. Make sure the screenshots show the Warehouse Savings list.
          </Text>
        ) : (
          <Text style={styles.body}>
            Saving these prices checks everything you bought in the last 30 days.
          </Text>
        )}
        {ended > 0 ? (
          <Text style={styles.problem}>
            {ended} offer{ended === 1 ? ' has' : 's have'} already ended and won&apos;t be saved.
          </Text>
        ) : null}
      </Card>

      {offers.map((o) => (
        <View key={o.itemNumber} style={styles.row}>
          <View style={styles.rowTop}>
            <View style={styles.rowMain}>
              <Text style={styles.description} numberOfLines={1}>
                {o.name || `Item ${o.itemNumber}`}
              </Text>
              <Text style={styles.meta}>
                #{o.itemNumber}
                {o.discountCents ? ` · ${formatCents(o.discountCents)} off` : ''} · through{' '}
                {shortDate(o.validThrough)}
                {o.limit ? ` · limit ${o.limit}` : ''}
              </Text>
            </View>
            <Text style={styles.price}>{formatCents(o.priceCents)}</Text>
          </View>
        </View>
      ))}

      {savings.incomplete.length > 0 ? (
        <Card>
          <Text style={styles.label}>Cut off or not readable</Text>
          <Text style={styles.body}>Add a screenshot that shows these whole, or skip them.</Text>
          {savings.incomplete.slice(0, 15).map((name) => (
            <Text key={name} style={styles.unparsed}>
              {name}
            </Text>
          ))}
        </Card>
      ) : null}

      <ErrorText>{error}</ErrorText>
      {offers.length > 0 ? (
        <Button
          title={`Save ${offers.length} price${offers.length === 1 ? '' : 's'}`}
          busy={busy}
          onPress={() => void save(savings, offers)}
        />
      ) : null}
      <Button title="Choose different screenshots" variant="secondary" onPress={pick} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: space.lg },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: space.xs },
  body: { fontSize: 15, color: colors.text, lineHeight: 21, marginTop: space.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  problem: { fontSize: 14, color: colors.warning, marginTop: space.sm, lineHeight: 20 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, marginRight: space.sm },
  description: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  price: { fontSize: 16, fontWeight: '700', color: colors.text },
  unparsed: { fontSize: 13, color: colors.muted, fontFamily: 'monospace' },
});
