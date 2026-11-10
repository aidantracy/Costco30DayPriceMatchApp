/** Shapes returned by the backend API (api/app/routers). Dates are ISO `YYYY-MM-DD`. */

export type Channel = 'warehouse' | 'online';
export type FlagStatus = 'flagged' | 'claimed' | 'refunded' | 'denied' | 'dismissed';

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Me {
  id: string;
  email: string;
  time_zone: string;
  automation_enabled: boolean;
}

export interface Purchase {
  id: string;
  source: 'sync' | 'screenshot' | 'manual';
  channel: Channel;
  item_number: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  purchase_date: string;
  last_eligible_date: string;
  days_left: number;
  excluded: boolean;
  exclusion_reason: string | null;
}

export interface FlagSummary {
  id: string;
  purchase_id: string;
  item_number: string;
  description: string;
  refund_due_cents: number;
  claim_deadline: string;
}

export interface ManualPurchaseIn {
  channel: Channel;
  item_number: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  purchase_date: string;
  warehouse_number?: string;
  confirm_duplicate?: boolean;
}

export interface ManualPurchaseOut {
  purchase: Purchase;
  already_cheaper: FlagSummary | null;
}

export interface Flag {
  id: string;
  status: FlagStatus;
  unread: boolean;
  item_number: string;
  description: string;
  refund_due_cents: number;
  claim_deadline: string;
}

export interface ClaimCard {
  flag_id: string;
  status: FlagStatus;
  item_number: string;
  description: string;
  channel: Channel;
  purchase_date: string;
  warehouse_number: string | null;
  quantity: number;
  eligible_quantity: number;
  price_paid_cents: number;
  current_price_cents: number;
  refund_due_cents: number;
  price_seen_on: string;
  price_source: string;
  promo_end: string | null;
  last_eligible_date: string;
  claim_deadline: string;
  claim_path: string;
}

export interface FlagUpdate {
  read?: boolean;
  status?: FlagStatus;
  refunded_cents?: number;
  denial_reason?: string;
}

export interface Savings {
  total_refunded_cents: number;
  by_month: Record<string, number>;
  claims: Flag[];
  alert_accuracy: number | null;
}
