import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from './care-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { eventInputSchema, type AuthResponse, type ChangePage, type EventInput, type Household, type MutationResult, type Snapshot, type SyncMutation, type User } from '@nestwise/shared';
import { applyChanges, applyResult, optimisticEvents } from './queue';
import { enableLocalNotifications, localNotificationsSupported, reconcileNotifications } from './notifications';
import { shareBackup } from './backup';

const apiUrl = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://localhost:3001' : '');
if (!apiUrl) throw new Error('EXPO_PUBLIC_API_URL must be configured when building NestWise.');
type RequestOptions = { method?: string; body?: unknown };
type Conflict = { mutation: SyncMutation; result: MutationResult };
type Cache = { snapshot: Snapshot; queue: SyncMutation[]; conflicts: Conflict[] };
type State = { user: User | null; households: Household[]; householdId: string | null; cache: Cache | null };
const initial: State = { user: null, households: [], householdId: null, cache: null };
const credential = {
  get: () => Platform.OS === 'web' ? Promise.resolve(sessionStorage.getItem('nestwise.session')) : SecureStore.getItemAsync('nestwise.session'),
  set: (value: string) => Platform.OS === 'web' ? Promise.resolve(sessionStorage.setItem('nestwise.session', value)) : SecureStore.setItemAsync('nestwise.session', value),
  remove: () => Platform.OS === 'web' ? Promise.resolve(sessionStorage.removeItem('nestwise.session')) : SecureStore.deleteItemAsync('nestwise.session'),
};
function useNestState() {
  const [state, setState] = useState<State>(initial); const stateRef = useRef(state); const token = useRef<string | null>(null);
  const [loading, setLoading] = useState(true); const [online, setOnline] = useState(true); const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null); const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const busy = useRef(false); const active = useRef(true); const writes = useRef(Promise.resolve());
  const idleWaiters = useRef<Array<() => void>>([]);
  const switching = useRef(false);
  const endingSession = useRef(false); const [sessionGeneration, setSessionGeneration] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const syncAgain = useRef(false); const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryCount = useRef(0); const [realtime, setRealtime] = useState<'connecting' | 'connected' | 'reconnecting' | 'denied'>('connecting');
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const replace = (next: State) => { stateRef.current = next; if (active.current) setState(next); };
  const key = (s: State) => `nestwise.cache.${s.user!.id}.${s.householdId}`;
  const persist = async (next: State) => {
    if (!next.cache || !next.user || !next.householdId) { replace(next); return; }
    const value = JSON.stringify(next.cache); const storageKey = key(next);
    const write = writes.current.then(() => AsyncStorage.setItem(storageKey, value));
    writes.current = write.catch(() => {});
    await write;
    await AsyncStorage.setItem(`nestwise.meta.${next.user.id}`, JSON.stringify({ households: next.households, householdId: next.householdId }));
    replace(next);
  };
  // Merge against the latest cache inside a serialized write, not a stale render or network request.
  async function editCache(edit: (cache: Cache) => Cache) {
    const write = writes.current.then(async () => {
      const current = stateRef.current;
      if (!current.cache) throw new Error('Load your household first.');
      const next = { ...current, cache: edit(current.cache) };
      await AsyncStorage.setItem(key(next), JSON.stringify(next.cache)); replace(next);
    });
    writes.current = write.catch(() => {}); await write;
  }
  async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${path}`, { method: options.method || 'GET', headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token.current ? { Authorization: `Bearer ${token.current}` } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: AbortSignal.timeout(12000) });
      setOnline(true);
    } catch { setOnline(false); throw new Error('Cannot reach NestWise. Your saved logs remain on this device.'); }
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status}).`), { status: response.status });
    return data as T;
  }
  async function selectHousehold(id: string) {
    if (switching.current) throw new Error('A household is already loading.');
    switching.current = true;
    try {
    if (busy.current) await new Promise<void>(resolve => idleWaiters.current.push(resolve));
    await writes.current;
    const current = stateRef.current;
    const cached = await AsyncStorage.getItem(`nestwise.cache.${current.user!.id}.${id}`);
    replace({ ...current, householdId: id, cache: cached ? JSON.parse(cached) as Cache : null });
    const snapshot = await request<Snapshot>(`/households/${id}/snapshot`);
    const latest = stateRef.current;
    await persist({ ...latest, cache: { snapshot, queue: latest.cache?.queue || [], conflicts: latest.cache?.conflicts || [] } });
    } finally { switching.current = false; if (syncAgain.current) { syncAgain.current = false; void syncRef.current(); } }
  }
  async function refresh() {
    const households = await request<Household[]>('/households');
    replace({ ...stateRef.current, households });
    const id = households.find(h => h.id === stateRef.current.householdId)?.id || households[0]?.id;
    if (id) await selectHousehold(id);
    else replace({ ...stateRef.current, householdId: null, cache: null });
  }
  async function authenticate(path: string, body: unknown) {
    const auth = await request<AuthResponse>(path, { method: 'POST', body });
    await credential.set(JSON.stringify(auth)); token.current = auth.token;
    setSessionGeneration(n => n + 1);
    replace({ ...initial, user: auth.user }); await refresh();
  }
  async function sync() {
    if (busy.current || switching.current) { syncAgain.current = true; return; }
    if (!stateRef.current.cache || !token.current || endingSession.current) return;
    clearTimeout(retry.current);
    busy.current = true; setSyncing(true);
    try {
      let current = stateRef.current;
      while (current.cache!.queue.length) {
        const mutation = current.cache!.queue.find(m => !current.cache!.conflicts.some(c => c.mutation.eventId === m.eventId));
        if (!mutation) break;
        const [result] = await request<MutationResult[]>(`/households/${current.householdId}/sync`, { method: 'POST', body: [mutation] });
        await editCache(cache => ({ snapshot: applyResult(cache.snapshot, result),
          queue: cache.queue.filter(m => m.mutationId !== mutation.mutationId),
          conflicts: result.status === 'conflict' ? [...cache.conflicts, { mutation, result }] : cache.conflicts }));
        current = stateRef.current;
      }
      if (current.cache!.snapshot.revision === undefined) {
        const snapshot = await request<Snapshot>(`/households/${current.householdId}/snapshot`);
        await editCache(cache => ({ ...cache, snapshot }));
      } else {
        let more = true;
        while (more) {
          current = stateRef.current;
          const page = await request<ChangePage>(`/households/${current.householdId}/changes?after=${current.cache!.snapshot.revision}`);
          await editCache(cache => ({ ...cache, snapshot: applyChanges(cache.snapshot, page.changes, current.user!.id) }));
          more = page.hasMore;
        }
      }
      retryCount.current = 0;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Synchronization failed.');
      const status = (e as { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) setRealtime('denied');
      if (!status || status >= 500 || status === 429) retry.current = setTimeout(() => void syncRef.current(), Math.min(30000, 1000 * 2 ** retryCount.current++));
      syncAgain.current = false;
    }
    finally { busy.current = false; setSyncing(false); idleWaiters.current.splice(0).forEach(resolve => resolve()); if (syncAgain.current) { syncAgain.current = false; void syncRef.current(); } }
  }
  syncRef.current = sync;
  async function mutate(input: EventInput, operation: SyncMutation['operation'] = 'create', baseVersion = 0) {
    if (endingSession.current) throw new Error('Sign-out is in progress.');
    if (realtime === 'denied') throw new Error('Sign in again or restore household access before adding more care. Your pending logs remain saved.');
    if (switching.current) throw new Error('Wait for your household to load.');
      const current = stateRef.current;
      if (!current.cache || current.cache.snapshot.household.role === 'viewer') throw new Error('You do not have permission to log care.');
      if (current.cache.conflicts.some(c => c.mutation.eventId === input.id)) throw new Error('Resolve this event’s conflict in Settings first.');
      const event = eventInputSchema.parse(input);
      const mutation: SyncMutation = { mutationId: Crypto.randomUUID(), operation, eventId: event.id, baseVersion, ...(operation !== 'delete' ? { event } : {}) };
      await editCache(cache => ({ ...cache, queue: [...cache.queue, mutation] }));
    void sync();
  }
  useEffect(() => {
    active.current = true;
    void (async () => {
      try {
        const appearance = await AsyncStorage.getItem('nestwise.theme');
        if (appearance === 'system' || appearance === 'light' || appearance === 'dark') setTheme(appearance);
        setNotificationsEnabled(await AsyncStorage.getItem('nestwise.notifications') === 'enabled');
        const saved = await credential.get();
        if (saved) {
          const auth = JSON.parse(saved) as AuthResponse; token.current = auth.token;
          const metaRaw = await AsyncStorage.getItem(`nestwise.meta.${auth.user.id}`);
          const meta = metaRaw ? JSON.parse(metaRaw) as Pick<State, 'households' | 'householdId'> : { households: [], householdId: null };
          const cached = meta.householdId ? await AsyncStorage.getItem(`nestwise.cache.${auth.user.id}.${meta.householdId}`) : null;
          replace({ ...initial, ...meta, user: auth.user, cache: cached ? JSON.parse(cached) as Cache : null });
          await refresh();
        }
      } catch (e) { setError(e instanceof Error ? e.message : 'Unable to restore session.'); }
      finally { setLoading(false); }
    })();
    return () => { active.current = false; clearTimeout(retry.current); };
  }, []);
  useEffect(() => {
    if (!state.user || !state.householdId || !token.current || loading) return;
    let disposed = false; let socket: WebSocket | null = null; let attempt = 0;
    let reconnect: ReturnType<typeof setTimeout>; let watchdog: ReturnType<typeof setTimeout>;
    function connect() {
      if (disposed) return;
      clearTimeout(reconnect); clearTimeout(watchdog);
      setRealtime(attempt ? 'reconnecting' : 'connecting');
      const ws = new WebSocket(`${apiUrl.replace(/^http/, 'ws')}/realtime`); socket = ws;
      const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => ws.close(), 60000); };
      arm();
      ws.onopen = () => { ws.send(JSON.stringify({ token: token.current, householdId: state.householdId })); arm(); };
      ws.onmessage = event => {
        if (disposed || socket !== ws) return;
        arm();
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'ready') { attempt = 0; setRealtime('connected'); void syncRef.current(); }
          if (message.type === 'changed') void syncRef.current();
        } catch { ws.close(); }
      };
      ws.onerror = () => ws.close();
      ws.onclose = event => {
        if (socket !== ws) return;
        clearTimeout(watchdog);
        if (disposed) return;
        if (event.code === 4403 || event.code === 4401) { setRealtime('denied'); setError('Your session or household access has ended. Pending care logs remain saved on this device.'); return; }
        setRealtime('reconnecting');
        reconnect = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++) + Math.random() * 500);
      };
    }
    connect();
    const foreground = AppState.addEventListener('change', status => { if (status === 'active') { if (socket?.readyState === WebSocket.OPEN) void syncRef.current(); else if (socket?.readyState !== WebSocket.CONNECTING) { clearTimeout(reconnect); connect(); } } });
    return () => { disposed = true; clearTimeout(reconnect); clearTimeout(watchdog); clearTimeout(retry.current); socket?.close(); foreground.remove(); };
  }, [state.user?.id, state.householdId, loading, sessionGeneration]);
  useEffect(() => {
    if (loading || !localNotificationsSupported) return;
    void reconcileNotifications(notificationsEnabled && realtime !== 'denied' ? state.cache?.snapshot.reminders || [] : []).catch(() => setError('Could not update device reminders. Open the app to check current reminders.'));
  }, [state.cache?.snapshot.reminders, notificationsEnabled, loading, realtime]);
  const snapshot = state.cache && state.user ? { ...state.cache.snapshot, events: optimisticEvents(state.cache.snapshot, state.cache.queue, state.user) } : null;
  return { ...state, snapshot, loading, online, syncing, realtime, error, theme,
    exportLocalBackup: async () => {
      await writes.current;
      const user = stateRef.current.user; if (!user) throw new Error('Restore your session before exporting.');
      const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(`nestwise.cache.${user.id}.`));
      const caches = (await AsyncStorage.multiGet(keys)).map(([key, value]) => ({ householdId: key.split('.').at(-1), data: value ? JSON.parse(value) : null }));
      await shareBackup({ format: 'nestwise-local-care-backup-v1', exportedAt: new Date().toISOString(), user, households: caches });
    },
    localNotificationsSupported, notificationsEnabled,
    setNotifications: async (enabled: boolean) => {
      if (enabled) await enableLocalNotifications();
      await AsyncStorage.setItem('nestwise.notifications', enabled ? 'enabled' : 'disabled');
      await reconcileNotifications(enabled ? stateRef.current.cache?.snapshot.reminders || [] : []); setNotificationsEnabled(enabled);
    },
    setTheme: (value: typeof theme) => { setTheme(value); void AsyncStorage.setItem('nestwise.theme', value).catch(() => setError('Could not save your appearance preference.')); }, request, refresh, selectHousehold, sync, mutate,
    queue: state.cache?.queue || [], conflicts: state.cache?.conflicts || [], clearError: () => setError(null),
    register: (name: string, email: string, password: string) => authenticate('/auth/register', { name, email, password }),
    login: (email: string, password: string) => authenticate('/auth/login', { email, password }),
    createHousehold: async (name: string, timezone: string) => { const h = await request<Household>('/households', { method: 'POST', body: { name, timezone } }); await refresh(); await selectHousehold(h.id); },
    resolveConflict: async (eventId: string) => {
      if (busy.current) throw new Error('Wait for synchronization to finish.');
      await editCache(cache => ({ ...cache, conflicts: cache.conflicts.filter(c => c.mutation.eventId !== eventId), queue: cache.queue.filter(m => m.eventId !== eventId) }));
    },
    deleteAccount: async (confirmation: string, password: string) => {
      if (endingSession.current || busy.current || switching.current) throw new Error('Wait for synchronization to finish.');
      endingSession.current = true;
      try {
        await writes.current;
        const current = stateRef.current;
        const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(`nestwise.cache.${current.user!.id}.`));
        const caches = await AsyncStorage.multiGet(keys);
        if (caches.some(([, value]) => { const cache = value ? JSON.parse(value) as Cache : null; return cache && (cache.queue.length || cache.conflicts.length); })) throw new Error('Resolve pending logs in every cached household before deleting your account. Export a local backup if access has been removed.');
        await request('/auth/account', { method: 'DELETE', body: { confirmation, password } });
        await reconcileNotifications([]);
        await AsyncStorage.multiRemove([...keys, `nestwise.meta.${current.user!.id}`]);
        await credential.remove(); token.current = null; replace(initial);
      } finally { endingSession.current = false; }
    },
    deleteHousehold: async (confirmation: string) => {
      if (endingSession.current || busy.current || switching.current) throw new Error('Wait for synchronization to finish.');
      endingSession.current = true;
      try {
        await writes.current;
        const current = stateRef.current;
        if (current.cache?.queue.length || current.cache?.conflicts.length) throw new Error('Finish synchronization and resolve conflicts before deleting this household.');
        await request(`/households/${current.householdId}`, { method: 'DELETE', body: { confirmation } });
        await reconcileNotifications([]);
        await AsyncStorage.removeItem(`nestwise.cache.${current.user!.id}.${current.householdId}`);
        replace({ ...current, householdId: null, cache: null, households: current.households.filter(h => h.id !== current.householdId) });
        await refresh();
      } finally { endingSession.current = false; }
    },
    logout: async () => {
      if (endingSession.current) return;
      endingSession.current = true;
      try {
      await writes.current;
      if (busy.current || stateRef.current.cache?.queue.length || stateRef.current.cache?.conflicts.length) throw new Error('Finish synchronization and resolve conflicts before signing out.');
      const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(`nestwise.cache.${stateRef.current.user!.id}.`));
      const caches = await AsyncStorage.multiGet(keys);
      if (caches.some(([, value]) => { const cache = value ? JSON.parse(value) as Cache : null; return cache && (cache.queue.length || cache.conflicts.length); })) throw new Error('Another household has pending logs or conflicts. Switch to that household and resolve them before signing out.');
      await request('/auth/logout', { method: 'POST' });
      await reconcileNotifications([]);
      await AsyncStorage.multiRemove([...keys, `nestwise.meta.${stateRef.current.user!.id}`]); await credential.remove(); token.current = null; replace(initial);
      } finally { endingSession.current = false; }
    },
  };
}
const Context = createContext<ReturnType<typeof useNestState> | null>(null);
export function NestProvider({ children }: { children: ReactNode }) { const value = useNestState(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useNest() { const value = useContext(Context); if (!value) throw new Error('NestProvider is required'); return value; }
