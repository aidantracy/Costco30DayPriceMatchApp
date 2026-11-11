import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { shortDate, todayIso } from '../dates';
import { canRecognize, recognize } from '../import/recognize';
import { problems, readScreenshots, recheck, toBatch, withPrice } from '../import/receipt';
import { formatCents, parseDollars } from '../money';
import type { PurchasesStackParams } from '../navigation';
import type { ParsedReceipt, ReceiptItem } from '../parsing/types';
import { Button, Card, ErrorText, Field, Message } from '../ui/components';
import { colors, space } from '../ui/theme';

type Props = NativeStackScreenProps<PurchasesStackParams, 'ImportReceipt'>;

type Step =
  | { kind: 'start' }
  | { kind: 'reading'; done: number; total: number }
  | { kind: 'review'; receipt: ParsedReceipt };

export function ImportReceiptScreen({ navigation }: Props) {
  const { api } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 10,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    try {
      const shots = [];
      for (const [i, asset] of result.assets.entries()) {
        setStep({ kind: 'reading', done: i, total: result.assets.length });
        shots.push(await recognize(asset.uri));
      }
      const receipt = readScreenshots(shots);
      setItems(receipt.items);
      setEditing(null);
      setStep({ kind: 'review', receipt });
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: 'start' });
    }
  }

  if (!canRecognize()) {
    return (
      <Message
        title="Needs the full app build"
        body="Reading receipt screenshots uses on-device text recognition, which Expo Go can't run. Install the development build to use this. You can still add purchases by hand."
        action={<Button title="Add by hand" onPress={() => navigation.replace('AddPurchase')} />}
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
          <Text style={styles.title}>Import a warehouse receipt</Text>
          <Text style={styles.body}>
            1. In the Costco app, open Account → Orders & Purchases → Warehouse and open a receipt.
          </Text>
          <Text style={styles.body}>
            2. Take screenshots from the top to the bottom, overlapping a little. Include the bottom
            lines with the totals and the Whse/Trm/Trn number.
          </Text>
          <Text style={styles.body}>3. Pick them here in the same order.</Text>
        </Card>
        <ErrorText>{error}</ErrorText>
        <Button title="Choose screenshots" onPress={pick} />
      </ScrollView>
    );
  }

  return (
    <Review
      receipt={step.receipt}
      items={items}
      setItems={setItems}
      editing={editing}
      setEditing={setEditing}
      busy={busy}
      error={error}
      onRepick={pick}
      onSave={async (force) => {
        const today = todayIso();
        const body = toBatch(step.receipt, items, today);
        if (!body) return;
        const checks = recheck(step.receipt, items);
        if (!force && !checks.every((c) => c.passed)) {
          Alert.alert(
            "Totals don't match",
            'Some prices may be misread. Save these items anyway? You can fix or delete them later.',
            [
              { text: 'Keep checking', style: 'cancel' },
              { text: 'Save anyway', onPress: () => void save(body) },
            ],
          );
          return;
        }
        await save(body);
      }}
      onGiveUp={async () => {
        const reasons = problems(step.receipt, recheck(step.receipt, items));
        try {
          await api.reportUnreadable(reasons[0] ?? 'Receipt could not be read', step.receipt.parserVersion);
        } catch {
          // Reporting is best effort; adding by hand matters more.
        }
        navigation.replace('AddPurchase');
      }}
    />
  );

  async function save(body: NonNullable<ReturnType<typeof toBatch>>) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.importReceipts(body);
      const parts = [`Added ${result.created} item${result.created === 1 ? '' : 's'}.`];
      if (result.duplicates) parts.push(`${result.duplicates} were already saved.`);
      for (const d of result.already_cheaper) {
        parts.push(
          `${d.description} is already cheaper: save ${formatCents(d.refund_due_cents)} by ${shortDate(d.claim_deadline)}.`,
        );
      }
      Alert.alert('Receipt imported', parts.join('\n'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
}

function Review(props: {
  receipt: ParsedReceipt;
  items: ReceiptItem[];
  setItems: (items: ReceiptItem[]) => void;
  editing: number | null;
  setEditing: (lineNo: number | null) => void;
  busy: boolean;
  error: string | null;
  onRepick: () => void;
  onSave: (force: boolean) => void;
  onGiveUp: () => void;
}) {
  const { receipt, items } = props;
  const checks = useMemo(() => recheck(receipt, items), [receipt, items]);
  const issues = problems(receipt, checks);
  const id = receipt.receiptId;
  const today = todayIso();
  const future = id ? id.date > today : false;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.title}>
          {id ? `Warehouse #${Number(id.warehouse)} · ${shortDate(id.date)}` : 'Receipt'}
        </Text>
        <Text style={styles.body}>
          {items.length} item{items.length === 1 ? '' : 's'} ·{' '}
          {formatCents(items.reduce((s, i) => s + i.pricePaidCents, 0))} after instant savings
        </Text>
        {issues.length === 0 ? (
          <Text style={styles.ok}>Everything adds up.</Text>
        ) : (
          issues.map((p) => (
            <Text key={p} style={styles.problem}>
              • {p}
            </Text>
          ))
        )}
        {future ? <Text style={styles.problem}>• The receipt date is in the future.</Text> : null}
      </Card>

      {items.map((item) => (
        <ItemRow
          key={item.lineNo}
          item={item}
          open={props.editing === item.lineNo}
          onToggle={() => props.setEditing(props.editing === item.lineNo ? null : item.lineNo)}
          onPrice={(cents) =>
            props.setItems(items.map((i) => (i.lineNo === item.lineNo ? withPrice(i, cents) : i)))
          }
          onRemove={() => {
            props.setItems(items.filter((i) => i.lineNo !== item.lineNo));
            props.setEditing(null);
          }}
        />
      ))}

      {receipt.unparsedRows.length > 0 ? (
        <Card>
          <Text style={styles.label}>{"Lines that weren't recognized"}</Text>
          {receipt.unparsedRows.slice(0, 15).map((r, n) => (
            <Text key={`${n}-${r}`} style={styles.unparsed}>
              {r}
            </Text>
          ))}
        </Card>
      ) : null}

      <ErrorText>{props.error}</ErrorText>
      {id && !future && items.length > 0 ? (
        <Button
          title={`Save ${items.length} item${items.length === 1 ? '' : 's'}`}
          busy={props.busy}
          onPress={() => props.onSave(false)}
        />
      ) : null}
      <Button title="Choose different screenshots" variant="secondary" onPress={props.onRepick} />
      <Button title="Can't fix it, add by hand" variant="secondary" onPress={props.onGiveUp} />
    </ScrollView>
  );
}

function ItemRow(props: {
  item: ReceiptItem;
  open: boolean;
  onToggle: () => void;
  onPrice: (cents: number) => void;
  onRemove: () => void;
}) {
  const { item } = props;
  const [price, setPrice] = useState((item.linePriceCents / 100).toFixed(2));
  const [priceError, setPriceError] = useState<string | undefined>();

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityHint="Tap to correct" onPress={props.onToggle}>
        <View style={styles.rowTop}>
          <View style={styles.rowMain}>
            <Text style={styles.description} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={styles.meta}>
              #{item.itemNumber}
              {item.discountCents ? ` · ${formatCents(item.discountCents)} instant savings` : ''}
            </Text>
          </View>
          <Text style={styles.price}>{formatCents(item.pricePaidCents)}</Text>
        </View>
      </Pressable>
      {props.open ? (
        <View style={styles.editor}>
          <Field
            label="Printed price"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            error={priceError}
            hint="The price on the receipt line, before instant savings."
          />
          <Button
            title="Update price"
            onPress={() => {
              const cents = parseDollars(price);
              if (cents === null) {
                setPriceError('Enter a price like 18.99.');
                return;
              }
              setPriceError(undefined);
              props.onPrice(cents);
            }}
          />
          <Button title="Remove this line" variant="secondary" onPress={props.onRemove} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: space.lg },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: space.xs },
  body: { fontSize: 15, color: colors.text, lineHeight: 21, marginTop: space.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  ok: { fontSize: 15, color: colors.success, marginTop: space.sm, fontWeight: '600' },
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
  editor: { marginTop: space.md },
  unparsed: { fontSize: 13, color: colors.muted, fontFamily: 'monospace' },
});
