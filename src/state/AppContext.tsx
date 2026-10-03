import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { AppSnapshot } from '../services/waterAppService';
import * as waterApp from '../services/waterAppService';
import { SettingsUpdate } from '../repositories/settingsRepository';
import { syncKeepAliveWithSettings } from '../services/backgroundKeepAlive';

interface AppContextValue {
  ready: boolean;
  loading: boolean;
  error: string | null;
  snapshot: AppSnapshot | null;
  refresh: () => Promise<void>;
  advanceDueReminders: (opts?: {
    presentNotification?: boolean;
  }) => Promise<void>;
  recordDrink: typeof waterApp.recordDrink;
  snoozeReminder: typeof waterApp.snoozeReminder;
  editDrink: typeof waterApp.editDrink;
  deleteDrink: typeof waterApp.deleteDrink;
  saveSettings: (patch: SettingsUpdate) => Promise<void>;
  scheduleNextReminder: typeof waterApp.scheduleNextReminder;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await waterApp.getSnapshot();
      setSnapshot(snap);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const advanceDueReminders = useCallback(
    async (opts?: { presentNotification?: boolean }) => {
      try {
        const snap = await waterApp.advanceDueReminders(opts);
        setSnapshot(snap);
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : '推进提醒失败');
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await waterApp.bootstrapApp();
        if (!cancelled) {
          setSnapshot(snap);
          setReady(true);
          void syncKeepAliveWithSettings(
            snap.settings.notifications_enabled === 1,
          ).catch(() => undefined);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void advanceDueReminders({ presentNotification: false });
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [advanceDueReminders]);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      loading,
      error,
      snapshot,
      refresh,
      advanceDueReminders,
      recordDrink: async (input) => {
        const snap = await waterApp.recordDrink(input);
        setSnapshot(snap);
        return snap;
      },
      snoozeReminder: async (input) => {
        const snap = await waterApp.snoozeReminder(input);
        setSnapshot(snap);
        return snap;
      },
      editDrink: async (id, patch) => {
        const snap = await waterApp.editDrink(id, patch);
        setSnapshot(snap);
        return snap;
      },
      deleteDrink: async (id) => {
        const snap = await waterApp.deleteDrink(id);
        setSnapshot(snap);
        return snap;
      },
      saveSettings: async (patch) => {
        const snap = await waterApp.saveSettingsAndReschedule(patch);
        setSnapshot(snap);
        await syncKeepAliveWithSettings(
          snap.settings.notifications_enabled === 1,
        ).catch(() => undefined);
      },
      scheduleNextReminder: async (options) => {
        const job = await waterApp.scheduleNextReminder(options);
        setSnapshot(await waterApp.getSnapshot());
        return job;
      },
    }),
    [ready, loading, error, snapshot, refresh, advanceDueReminders],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
