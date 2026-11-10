import { requireOptionalNativeModule } from 'expo';

import type { OcrElement } from '../parsing/types';

interface NativeLine {
  text: string;
  left: number | null;
  top: number | null;
  right: number | null;
  bottom: number | null;
}

interface ReceiptTextModule {
  recognize(uri: string): Promise<NativeLine[]>;
}

// The in-repo native module (modules/receipt-text). It's missing in Expo Go, which can't load
// custom native code, so the import screen explains that a development build is needed.
const native = requireOptionalNativeModule<ReceiptTextModule>('ReceiptText');

export function canRecognize(): boolean {
  return native !== null;
}

/** On-device text recognition for one image. Nothing leaves the phone. */
export async function recognize(uri: string): Promise<OcrElement[]> {
  if (!native) throw new Error('Text recognition needs the full app build, not Expo Go.');
  const lines = await native.recognize(uri);
  return lines.map((l) =>
    l.left === null || l.top === null || l.right === null || l.bottom === null
      ? { text: l.text }
      : { text: l.text, frame: { left: l.left, top: l.top, right: l.right, bottom: l.bottom } },
  );
}
