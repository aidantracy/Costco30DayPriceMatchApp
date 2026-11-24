import { requireOptionalNativeModule } from 'expo';

import type { OcrElement } from '../parsing/types';

export type ReaderState = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ReaderStatus {
  state: ReaderState;
  /** What the reader is doing: opening, waiting, finding, reading. */
  step: string;
  error: string;
  /** Text on screen at each scroll position, ready for the savings parser. */
  pages: OcrElement[][];
}

interface NativeLine {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CostcoSavingsModule {
  isCostcoInstalled(): boolean;
  isServiceEnabled(): boolean;
  openSettings(): void;
  start(): boolean;
  status(): { state: ReaderState; step: string; error: string; pages: NativeLine[][] };
  cancel(): void;
  clear(): void;
}

// The in-repo native module (modules/costco-savings), Android only. Missing in Expo Go and in
// builds made before it was added.
const native = requireOptionalNativeModule<CostcoSavingsModule>('CostcoSavings');

export function canRead(): boolean {
  return native !== null;
}

function mod(): CostcoSavingsModule {
  if (!native) throw new Error('Reading Warehouse Savings needs the latest app build.');
  return native;
}

export const savingsReader = {
  isCostcoInstalled: () => mod().isCostcoInstalled(),
  isServiceEnabled: () => mod().isServiceEnabled(),
  openSettings: () => mod().openSettings(),
  /** Opens the Costco app and starts reading. False when the Costco app isn't installed. */
  start: () => mod().start(),
  cancel: () => mod().cancel(),
  clear: () => mod().clear(),
  status(): ReaderStatus {
    const s = mod().status();
    return {
      state: s.state,
      step: s.step,
      error: s.error,
      pages: s.pages.map((page) =>
        page.map(({ text, left, top, right, bottom }) => ({
          text,
          frame: { left, top, right, bottom },
        })),
      ),
    };
  },
};
