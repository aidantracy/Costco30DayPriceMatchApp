import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/errors';
import type { Channel, ManualPurchaseIn } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { shortDate, todayIso } from '../dates';
import { formatCents } from '../money';
import type { PurchasesStackParams } from '../navigation';
import { emptyForm, validatePurchase, type FormErrors, type PurchaseForm } from '../purchases/form';
import { Button, ErrorText, Field } from '../ui/components';
import { colors, space } from '../ui/theme';

type Props = NativeStackScreenProps<PurchasesStackParams, 'AddPurchase'>;

export function AddPurchaseScreen({ navigation }: Props) {
  const { api } = useAuth();
  const today = todayIso();
  const [form, setForm] = useState<PurchaseForm>(() => emptyForm(today));
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof PurchaseForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save(body: ManualPurchaseIn) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.addPurchase(body);
      const drop = result.already_cheaper;
      if (drop) {
        Alert.alert(
          "It's already cheaper",
          `Save ${formatCents(drop.refund_due_cents)}. Claim by ${shortDate(drop.claim_deadline)}.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        navigation.goBack();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        Alert.alert('Already added?', e.message.split('. Send')[0] + '.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save anyway', onPress: () => save({ ...body, confirm_duplicate: true }) },
        ]);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const result = validatePurchase(form, today);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    void save(result.body);
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.label}>Where did you buy it?</Text>
      <View style={styles.segment}>
        {(['warehouse', 'online'] as Channel[]).map((c) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ selected: form.channel === c }}
            onPress={() => setForm((f) => ({ ...f, channel: c }))}
            style={[styles.option, form.channel === c && styles.optionOn]}
          >
            <Text style={[styles.optionText, form.channel === c && styles.optionTextOn]}>
              {c === 'warehouse' ? 'Warehouse' : 'Costco.com'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Item number"
        value={form.itemNumber}
        onChangeText={set('itemNumber')}
        keyboardType="number-pad"
        error={errors.itemNumber}
      />
      <Field
        label="Description"
        value={form.description}
        onChangeText={set('description')}
        autoCapitalize="characters"
        error={errors.description}
      />
      <View style={styles.row}>
        <View style={styles.half}>
          <Field
            label="Quantity"
            value={form.quantity}
            onChangeText={set('quantity')}
            keyboardType="number-pad"
            error={errors.quantity}
          />
        </View>
        <View style={styles.half}>
          <Field
            label="Price paid (each)"
            value={form.price}
            onChangeText={set('price')}
            keyboardType="decimal-pad"
            placeholder="18.99"
            error={errors.price}
          />
        </View>
      </View>
      <Field
        label="Purchase date"
        value={form.purchaseDate}
        onChangeText={set('purchaseDate')}
        placeholder="YYYY-MM-DD"
        hint="Use the date on the receipt."
        error={errors.purchaseDate}
      />
      {form.channel === 'warehouse' ? (
        <Field
          label="Warehouse number"
          value={form.warehouseNumber}
          onChangeText={set('warehouseNumber')}
          keyboardType="number-pad"
          hint="Printed at the top of the receipt."
          error={errors.warehouseNumber}
        />
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Button title="Save purchase" onPress={submit} busy={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: space.lg },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  segment: { flexDirection: 'row', marginBottom: space.md },
  option: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  optionOn: { backgroundColor: colors.primary },
  optionText: { color: colors.primary, fontWeight: '600' },
  optionTextOn: { color: colors.primaryText },
  row: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
});
