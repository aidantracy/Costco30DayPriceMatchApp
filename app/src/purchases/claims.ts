import type { FlagStatus } from '../api/types';

/** Buttons offered on a claim card, matching the API's allowed moves (BR-8). */
export interface ClaimAction {
  label: string;
  status: FlagStatus;
}

const ACTIONS: Record<FlagStatus, ClaimAction[]> = {
  flagged: [
    { label: 'I claimed it', status: 'claimed' },
    { label: 'Not worth claiming', status: 'dismissed' },
  ],
  claimed: [
    { label: 'Got the refund', status: 'refunded' },
    { label: 'Refund was denied', status: 'denied' },
  ],
  refunded: [],
  denied: [],
  dismissed: [],
};

export function claimActions(status: FlagStatus): ClaimAction[] {
  return ACTIONS[status];
}

export const STATUS_LABEL: Record<FlagStatus, string> = {
  flagged: 'Ready to claim',
  claimed: 'Claimed, waiting on refund',
  refunded: 'Refunded',
  denied: 'Denied',
  dismissed: 'Dismissed',
};
