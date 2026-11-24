import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { PriceCheckProvider } from './src/prices/PriceCheckProvider';
import type { DropsStackParams, PurchasesStackParams, RootTabParams } from './src/navigation';
import { isSavingsReminder } from './src/prices/savingsReminder';
import { AddPurchaseScreen } from './src/screens/AddPurchaseScreen';
import { ChooseWarehouseScreen } from './src/screens/ChooseWarehouseScreen';
import { ClaimCardScreen } from './src/screens/ClaimCardScreen';
import { ImportReceiptScreen } from './src/screens/ImportReceiptScreen';
import { ReadSavingsScreen } from './src/screens/ReadSavingsScreen';
import { PriceDropsScreen } from './src/screens/PriceDropsScreen';
import { PurchasesScreen } from './src/screens/PurchasesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { colors } from './src/ui/theme';

const PurchasesStack = createNativeStackNavigator<PurchasesStackParams>();
const DropsStack = createNativeStackNavigator<DropsStackParams>();
const Tabs = createBottomTabNavigator<RootTabParams>();
const navigationRef = createNavigationContainerRef<RootTabParams>();

// Show the reminder even if it fires while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Opens the Warehouse Savings reader when its reminder notification is tapped. */
function useReminderLinks() {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response || !isSavingsReminder(response)) return;
    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (handled.current === key) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      if (!navigationRef.isReady()) {
        timer = setTimeout(open, 300);
        return;
      }
      handled.current = key;
      navigationRef.navigate('DropsTab', { screen: 'ReadSavings', params: { autoStart: true } });
    };
    open();
    return () => clearTimeout(timer);
  }, [response]);
}

function PurchasesTab() {
  return (
    <PurchasesStack.Navigator>
      <PurchasesStack.Screen name="Purchases" component={PurchasesScreen} />
      <PurchasesStack.Screen
        name="AddPurchase"
        component={AddPurchaseScreen}
        options={{ title: 'Add a purchase' }}
      />
      <PurchasesStack.Screen
        name="ImportReceipt"
        component={ImportReceiptScreen}
        options={{ title: 'Import a receipt' }}
      />
    </PurchasesStack.Navigator>
  );
}

function DropsTab() {
  return (
    <DropsStack.Navigator>
      <DropsStack.Screen
        name="PriceDrops"
        component={PriceDropsScreen}
        options={{ title: 'Price drops' }}
      />
      <DropsStack.Screen
        name="ClaimCard"
        component={ClaimCardScreen}
        options={{ title: 'Claim card' }}
      />
      <DropsStack.Screen
        name="ChooseWarehouse"
        component={ChooseWarehouseScreen}
        options={{ title: 'Your warehouse' }}
      />
      <DropsStack.Screen
        name="ReadSavings"
        component={ReadSavingsScreen}
        options={{ title: 'Warehouse Savings' }}
      />
    </DropsStack.Navigator>
  );
}

function Root() {
  const { status } = useAuth();
  useReminderLinks();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (status === 'signedOut') return <SignInScreen />;
  return (
    <PriceCheckProvider>
      <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}>
        <Tabs.Screen name="DropsTab" component={DropsTab} options={{ title: 'Price drops' }} />
        <Tabs.Screen
          name="PurchasesTab"
          component={PurchasesTab}
          options={{ title: 'Purchases' }}
        />
        <Tabs.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerShown: true, title: 'Settings' }}
        />
      </Tabs.Navigator>
    </PriceCheckProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer ref={navigationRef}>
          <Root />
          <StatusBar style="dark" />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
