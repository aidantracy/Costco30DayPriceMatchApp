import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { DropsStackParams } from '../navigation';
import { usePriceCheck } from '../prices/PriceCheckProvider';
import { Button } from '../ui/components';
import { colors, space } from '../ui/theme';

type Props = NativeStackScreenProps<DropsStackParams, 'ChooseWarehouse'>;

/**
 * costco.com in the same in-app browser the price check uses, so the warehouse chosen here
 * (kept in that browser's cookies) is the one whose prices are read (ADR 0007).
 */
export function ChooseWarehouseScreen({ navigation }: Props) {
  const { run } = usePriceCheck();
  return (
    <View style={styles.flex}>
      <Text style={styles.help}>
        {'Find your warehouse and tap "Set as My Warehouse". Then tap Done.'}
      </Text>
      <WebView
        style={styles.flex}
        source={{ uri: 'https://www.costco.com/warehouse-locations' }}
        javaScriptEnabled
        domStorageEnabled
      />
      <View style={styles.footer}>
        <Button
          title="Done"
          onPress={() => {
            void run(true);
            navigation.goBack();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  help: { padding: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  footer: { padding: space.md, backgroundColor: colors.surface },
});
