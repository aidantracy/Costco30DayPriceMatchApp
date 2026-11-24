import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { shortDate, todayIso } from '../dates';
import { currentOffers, readSavingsPages, seenOn, toPrices } from '../import/savings';
import { formatCents } from '../money';
import type { DropsStackParams } from '../navigation';
import type { ParsedSavings, SavingsOffer } from '../parsing/warehouseSavings';
import { canRead, savingsReader, type ReaderStatus } from '../prices/savingsReader';
import { scheduleSavingsReminder } from '../prices/savingsReminder';
import { Button, Card, ErrorText, Message } from '../ui/components';
import { colors, space } from '../ui/theme';

type Props = NativeStackScreenProps<DropsStackParams, 'ReadSavings'>;

const POLL_MS = 1000;

const STEP_TEXT: Record<string, string> = {
  opening: 'Opening the Costco app…',
  waiting: 'Waiting for the Costco app…',
  finding: 'Opening Warehouse Savings…',
  reading: 'Reading Warehouse Savings…',
};

export function ReadSavingsScreen({ navigation, route }: Props) {
  const { api } = useAuth();
  const [enabled, setEnabled] = useState(() => canRead() && savingsReader.isServiceEnabled());
  const [status, setStatus] = useState<ReaderStatus | null>(() =>
    canRead() ? savingsReader.status() : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!canRead()) return;
    setEnabled(savingsReader.isServiceEnabled());
    setStatus(savingsReader.status());
  }, []);

  // Coming back from Settings or the Costco app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const running = status?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  // Opened from the reminder: start reading at once when the reader is set up.
  const autoStart = route.params?.autoStart === true;
  useEffect(() => {
    if (!autoStart) return;
    navigation.setParams({ autoStart: undefined });
    if (
      canRead() &&
      savingsReader.isServiceEnabled() &&
      savingsReader.status().state !== 'running'
    ) {
      start();
    }
    // start() only reads stable module functions and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, navigation]);

  const savings = useMemo(
    () => (status?.state === 'done' ? readSavingsPages(status.pages) : null),
    [status],
  );

  function start() {
    setError(null);
    if (!savingsReader.start()) {
      setError("The Costco app isn't installed on this phone.");
      return;
    }
    refresh();
  }

  async function save(parsed: ParsedSavings, offers: SavingsOffer[]) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.recordPrices(toPrices(parsed, offers, todayIso()));
      savingsReader.clear();
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
      const remindOn = await scheduleSavingsReminder(offers.map((o) => o.validThrough)).catch(
        () => null,
      );
      if (remindOn) {
        parts.push(`Reminder set for ${shortDate(todayIso(remindOn))} to read it again.`);
      }
      Alert.alert('Warehouse Savings saved', parts.join('\n'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canRead()) {
    return (
      <Message
        title="Needs the latest app build"
        body="Reading Warehouse Savings uses a part of the app that this build doesn't have yet. Rebuild the app in Android Studio, then try again."
      />
    );
  }

  if (!enabled) {
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <Card>
          <Text style={styles.title}>Let the app read Warehouse Savings</Text>
          <Text style={styles.body}>
            The app opens the Costco app, scrolls through Warehouse Savings and reads the item
            numbers, prices and dates for you. Android needs your permission once.
          </Text>
          <Text style={styles.body}>1. Tap Open settings.</Text>
          <Text style={styles.body}>
            2. Under Downloaded apps (or Installed apps), tap &quot;Price Match Tracker: read
            Warehouse Savings&quot; and turn it on.
          </Text>
          <Text style={styles.body}>3. Come back here.</Text>
          <Text style={styles.note}>
            It only works inside the Costco app and only right after you tap Read. Nothing else on
            your phone is read, and only the prices are saved to your account.
          </Text>
        </Card>
        <Button title="Open settings" onPress={() => savingsReader.openSettings()} />
      </ScrollView>
    );
  }

  if (running) {
    return (
      <Message
        title={STEP_TEXT[status?.step ?? ''] ?? 'Reading Warehouse Savings…'}
        body="If the Costco app doesn't open Warehouse Savings by itself, open Warehouse → Warehouse Savings. The app comes back here when it's done."
        action={
          <Button
            title="Stop"
            variant="secondary"
            onPress={() => {
              savingsReader.cancel();
              refresh();
            }}
          />
        }
      />
    );
  }

  if (savings && status) {
    return (
      <Review
        status={status}
        savings={savings}
        busy={busy}
        error={error}
        onSave={save}
        onAgain={start}
      />
    );
  }

  const problem =
    status?.state === 'failed'
      ? status.error || "Couldn't read Warehouse Savings."
      : status?.state === 'cancelled'
        ? 'Stopped.'
        : null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.title}>Read Warehouse Savings</Text>
        <Text style={styles.body}>
          Most groceries aren&apos;t on costco.com, so their sale prices come from the Costco app.
          Tap Read: the Costco app opens, scrolls through Warehouse Savings by itself, and you come
          back here to check the prices before they&apos;re saved.
        </Text>
        <Text style={styles.note}>Keep your phone unlocked until it comes back here.</Text>
      </Card>
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      <ErrorText>{error}</ErrorText>
      <Button title="Read Warehouse Savings" onPress={start} />
    </ScrollView>
  );
}

function Review(props: {
  status: ReaderStatus;
  savings: ParsedSavings;
  busy: boolean;
  error: string | null;
  onSave: (savings: ParsedSavings, offers: SavingsOffer[]) => void;
  onAgain: () => void;
}) {
  const { savings } = props;
  const today = todayIso();
  const offers = currentOffers(savings, today);
  const ended = savings.offers.length - offers.length;
  // At the top and the bottom, so a long list needn't be scrolled first.
  const saveButton =
    offers.length > 0 ? (
      <Button
        title={`Save ${offers.length} price${offers.length === 1 ? '' : 's'}`}
        busy={props.busy}
        onPress={() => props.onSave(savings, offers)}
      />
    ) : null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.title}>
          {offers.length} offer{offers.length === 1 ? '' : 's'} · seen{' '}
          {shortDate(seenOn(savings, today))}
        </Text>
        {offers.length === 0 ? (
          <Text style={styles.problem}>
            No offers were found. Make sure the Costco app showed the Warehouse Savings list.
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
      {saveButton}

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
          <Text style={styles.label}>Not fully readable</Text>
          {savings.incomplete.slice(0, 15).map((name) => (
            <Text key={name} style={styles.unparsed}>
              {name}
            </Text>
          ))}
        </Card>
      ) : null}

      {offers.length === 0 && props.status.pages.length > 0 ? (
        <Card>
          <Text style={styles.label}>What the app saw (stays on your phone)</Text>
          {props.status.pages[0].slice(0, 40).map((l, n) => (
            <Text key={`${n}-${l.text}`} style={styles.unparsed}>
              {l.text}
            </Text>
          ))}
        </Card>
      ) : null}

      <ErrorText>{props.error}</ErrorText>
      {saveButton}
      <Button title="Read again" variant="secondary" onPress={props.onAgain} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: space.lg },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: space.xs },
  body: { fontSize: 15, color: colors.text, lineHeight: 21, marginTop: space.xs },
  note: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: space.sm },
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
