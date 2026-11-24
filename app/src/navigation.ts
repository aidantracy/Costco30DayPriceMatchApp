import type { NavigatorScreenParams } from '@react-navigation/native';

export type PurchasesStackParams = {
  Purchases: undefined;
  AddPurchase: undefined;
  ImportReceipt: undefined;
};

export type DropsStackParams = {
  PriceDrops: undefined;
  ClaimCard: { flagId: string };
  ChooseWarehouse: undefined;
  /** autoStart: opened from the reminder notification, so start reading right away. */
  ReadSavings: { autoStart?: boolean } | undefined;
};

export type RootTabParams = {
  DropsTab: NavigatorScreenParams<DropsStackParams>;
  PurchasesTab: NavigatorScreenParams<PurchasesStackParams>;
  Settings: undefined;
};
