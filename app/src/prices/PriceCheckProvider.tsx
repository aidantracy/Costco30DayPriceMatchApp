import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useAuth } from '../auth/AuthContext';
import { todayIso } from '../dates';
import { formatCents } from '../money';
import { runPriceCheck, type Outcome, type PageRead } from './runner';

/** How long to wait for one product page before moving on. */
const PAGE_TIMEOUT_MS = 25_000;

/**
 * Waits until the page shows a product (item number and a price), "no match", or a bot
 * challenge, then sends its text to the app. costco.com's search jumps to the product page
 * in the browser, so this runs again on each page load.
 */
const READ_PAGE = `(function () {
  if (window.__priceMatchPoll) return;
  window.__priceMatchPoll = true;
  var started = Date.now();
  var timer = setInterval(function () {
    var text = document.body ? document.body.innerText : '';
    var ready =
      /not able to find a match/i.test(text) ||
      /Access Denied|Request unsuccessful|Pardon Our Interruption/i.test(text) ||
      (/Item\\s*#?\\s*\\d{3,9}/.test(text) && /(Warehouse|Online) Price/i.test(text));
    if (ready || Date.now() - started > 20000) {
      clearInterval(timer);
      window.ReactNativeWebView.postMessage(text.slice(0, 20000));
    }
  }, 700);
})();
true;`;

export type CheckStatus =
  | { state: 'idle'; last?: Outcome; finishedOn?: string }
  | { state: 'running'; done: number; total: number };

interface PriceCheckValue {
  status: CheckStatus;
  /** Start a check now; with `force`, even if one already ran today. */
  run(force?: boolean): Promise<void>;
}

const PriceCheckContext = createContext<PriceCheckValue | null>(null);

export function PriceCheckProvider(props: { children: ReactNode; pauseMs?: number }) {
  const { api } = useAuth();
  const [status, setStatus] = useState<CheckStatus>({ state: 'idle' });
  const [page, setPage] = useState<{ item: string; uri: string } | null>(null);
  const pending = useRef<{
    resolve: (read: PageRead) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const running = useRef(false);
  const lastRunOn = useRef<string | null>(null);

  const finishPage = useCallback((read: PageRead) => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setPage(null);
    p.resolve(read);
  }, []);

  const lookup = useCallback(
    (item: string) =>
      new Promise<PageRead>((resolve) => {
        pending.current = {
          resolve,
          timer: setTimeout(() => finishPage({ error: 'timeout' }), PAGE_TIMEOUT_MS),
        };
        setPage({ item, uri: `https://www.costco.com/s?keyword=${encodeURIComponent(item)}` });
      }),
    [finishPage],
  );

  const run = useCallback(
    async (force = false) => {
      const today = todayIso();
      if (running.current || (!force && lastRunOn.current === today)) return;
      running.current = true;
      lastRunOn.current = today;
      try {
        const outcome = await runPriceCheck({
          api,
          lookup,
          pauseMs: props.pauseMs,
          onProgress: (done, total) => setStatus({ state: 'running', done, total }),
        });
        setStatus({ state: 'idle', last: outcome, finishedOn: today });
        if ((outcome.kind === 'done' || outcome.kind === 'blocked') && outcome.flagged.length) {
          Alert.alert(
            outcome.flagged.length === 1
              ? 'Price drop found'
              : `${outcome.flagged.length} price drops found`,
            outcome.flagged
              .map((f) => `${f.description}: save ${formatCents(f.refund_due_cents)}`)
              .join('\n'),
          );
        }
      } catch {
        // Signed out or the server is unreachable; try again next time the app opens.
        lastRunOn.current = null;
        setStatus({ state: 'idle' });
      } finally {
        running.current = false;
      }
    },
    [api, lookup, props.pauseMs],
  );

  // Check once a day: when signed in, and whenever the app comes back to the foreground.
  useEffect(() => {
    const first = setTimeout(() => void run(), 0);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [run]);

  const value = useMemo(() => ({ status, run }), [status, run]);

  return (
    <PriceCheckContext.Provider value={value}>
      {props.children}
      {page ? (
        <View pointerEvents="none" style={styles.hidden}>
          <WebView
            key={page.item}
            source={{ uri: page.uri }}
            injectedJavaScript={READ_PAGE}
            onMessage={(e: WebViewMessageEvent) => finishPage({ text: e.nativeEvent.data })}
            onError={() => finishPage({ error: 'timeout' })}
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
      ) : null}
    </PriceCheckContext.Provider>
  );
}

export function usePriceCheck(): PriceCheckValue {
  const value = useContext(PriceCheckContext);
  if (!value) throw new Error('usePriceCheck must be used inside PriceCheckProvider');
  return value;
}

/** One line for the Price drops screen. */
export function statusText(status: CheckStatus): string | null {
  if (status.state === 'running') {
    return `Checking costco.com prices… ${Math.min(status.done + 1, status.total)} of ${status.total}`;
  }
  const last = status.last;
  if (!last) return null;
  switch (last.kind) {
    case 'nothingDue':
      return 'Prices are up to date.';
    case 'done':
      return `Checked ${last.checked} item${last.checked === 1 ? '' : 's'} on costco.com today.`;
    case 'needWarehouse':
      return 'Choose your Costco warehouse so prices match your store.';
    case 'blocked':
      return 'costco.com stopped the price check. It will try again tomorrow.';
    case 'failed':
      return "Couldn't reach costco.com. Pull down to try again.";
  }
}

// Kept in the layout (not display: none) so Android keeps its timers running, but invisible.
const styles = StyleSheet.create({
  hidden: { position: 'absolute', left: 0, top: 0, width: 400, height: 800, opacity: 0 },
});
