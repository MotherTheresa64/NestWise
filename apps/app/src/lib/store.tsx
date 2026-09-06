import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { eventInputSchema, type AuthResponse, type EventInput, type Household, type MutationResult, type Snapshot, type SyncMutation, type User } from '@nestwise/shared';
import { applyResult, optimisticEvents } from './queue';

const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
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
  const switching = useRef(false);
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
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data as T;
  }
  async function selectHousehold(id: string) {
    if (busy.current) throw new Error('Please wait for synchronization to finish.');
    if (switching.current) throw new Error('A household is already loading.');
    switching.current = true;
    try {
    await writes.current;
    const current = stateRef.current;
    const cached = await AsyncStorage.getItem(`nestwise.cache.${current.user!.id}.${id}`);
    replace({ ...current, householdId: id, cache: cached ? JSON.parse(cached) as Cache : null });
    const snapshot = await request<Snapshot>(`/households/${id}/snapshot`);
    const latest = stateRef.current;
    await persist({ ...latest, cache: { snapshot, queue: latest.cache?.queue || [], conflicts: latest.cache?.conflicts || [] } });
    } finally { switching.current = false; }
  }
  async function refresh() {
    const households = await request<Household[]>('/households');
    replace({ ...stateRef.current, households });
    const id = households.find(h => h.id === stateRef.current.householdId)?.id || households[0]?.id;
    if (id) await selectHousehold(id);
  }
  async function authenticate(path: string, body: unknown) {
    const auth = await request<AuthResponse>(path, { method: 'POST', body });
    await credential.set(JSON.stringify(auth)); token.current = auth.token;
    replace({ ...initial, user: auth.user }); await refresh();
  }
  async function sync() {
    if (busy.current || switching.current || !stateRef.current.cache || !token.current) return;
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
      const snapshot = await request<Snapshot>(`/households/${current.householdId}/snapshot`);
      await editCache(cache => ({ ...cache, snapshot }));
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Synchronization failed.'); }
    finally { busy.current = false; setSyncing(false); }
  }
  async function mutate(input: EventInput, operation: SyncMutation['operation'] = 'create', baseVersion = 0) {
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
    const interval = setInterval(() => void sync(), 10000);
    return () => { active.current = false; clearInterval(interval); };
  }, []);
  const snapshot = state.cache && state.user ? { ...state.cache.snapshot, events: optimisticEvents(state.cache.snapshot, state.cache.queue, state.user) } : null;
  return { ...state, snapshot, loading, online, syncing, error, theme, setTheme, request, refresh, selectHousehold, sync, mutate,
    queue: state.cache?.queue || [], conflicts: state.cache?.conflicts || [], clearError: () => setError(null),
    register: (name: string, email: string, password: string) => authenticate('/auth/register', { name, email, password }),
    login: (email: string, password: string) => authenticate('/auth/login', { email, password }),
    createHousehold: async (name: string, timezone: string) => { const h = await request<Household>('/households', { method: 'POST', body: { name, timezone } }); await refresh(); await selectHousehold(h.id); },
    resolveConflict: async (eventId: string) => {
      if (busy.current) throw new Error('Wait for synchronization to finish.');
      await editCache(cache => ({ ...cache, conflicts: cache.conflicts.filter(c => c.mutation.eventId !== eventId), queue: cache.queue.filter(m => m.eventId !== eventId) }));
    },
    logout: async () => {
      if (busy.current || stateRef.current.cache?.queue.length || stateRef.current.cache?.conflicts.length) throw new Error('Finish synchronization and resolve conflicts before signing out.');
      const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(`nestwise.cache.${stateRef.current.user!.id}.`));
      const caches = await AsyncStorage.multiGet(keys);
      if (caches.some(([, value]) => { const cache = value ? JSON.parse(value) as Cache : null; return cache && (cache.queue.length || cache.conflicts.length); })) throw new Error('Another household has pending logs or conflicts. Switch to that household and resolve them before signing out.');
      await request('/auth/logout', { method: 'POST' });
      await AsyncStorage.multiRemove([...keys, `nestwise.meta.${stateRef.current.user!.id}`]); await credential.remove(); token.current = null; replace(initial);
    },
  };
}
const Context = createContext<ReturnType<typeof useNestState> | null>(null);
export function NestProvider({ children }: { children: ReactNode }) { const value = useNestState(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useNest() { const value = useContext(Context); if (!value) throw new Error('NestProvider is required'); return value; }
