import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import type { DropsStackParams, PurchasesStackParams } from './src/navigation';
import { AddPurchaseScreen } from './src/screens/AddPurchaseScreen';
import { ClaimCardScreen } from './src/screens/ClaimCardScreen';
import { PriceDropsScreen } from './src/screens/PriceDropsScreen';
import { PurchasesScreen } from './src/screens/PurchasesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { colors } from './src/ui/theme';

const PurchasesStack = createNativeStackNavigator<PurchasesStackParams>();
const DropsStack = createNativeStackNavigator<DropsStackParams>();
const Tabs = createBottomTabNavigator();

function PurchasesTab() {
  return (
    <PurchasesStack.Navigator>
      <PurchasesStack.Screen name="Purchases" component={PurchasesScreen} />
      <PurchasesStack.Screen
        name="AddPurchase"
        component={AddPurchaseScreen}
        options={{ title: 'Add a purchase' }}
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
    </DropsStack.Navigator>
  );
}

function Root() {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (status === 'signedOut') return <SignInScreen />;
  return (
    <Tabs.Navigator
      screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}
    >
      <Tabs.Screen name="DropsTab" component={DropsTab} options={{ title: 'Price drops' }} />
      <Tabs.Screen name="PurchasesTab" component={PurchasesTab} options={{ title: 'Purchases' }} />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: true, title: 'Settings' }}
      />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <Root />
          <StatusBar style="dark" />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
