import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({raw:new Map<string,string>(),secure:new Map<string,string>(),fail:false,counter:0}));
vi.mock('react-native',()=>({Platform:{OS:'ios'}}));
vi.mock('expo-crypto',()=>({getRandomBytesAsync:async(n:number)=>new Uint8Array(n).fill(++mocks.counter)}));
vi.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,getItemAsync:async(k:string)=>mocks.secure.get(k)||null,setItemAsync:async(k:string,v:string)=>{if(mocks.fail)throw new Error('Keychain unavailable');mocks.secure.set(k,v);},deleteItemAsync:async(k:string)=>{mocks.secure.delete(k);}}));
vi.mock('@react-native-async-storage/async-storage',()=>({default:{getItem:async(k:string)=>mocks.raw.get(k)||null,setItem:async(k:string,v:string)=>{mocks.raw.set(k,v);},getAllKeys:async()=>[...mocks.raw.keys()],multiGet:async(keys:string[])=>keys.map(k=>[k,mocks.raw.get(k)||null]),multiRemove:async(keys:string[])=>{keys.forEach(k=>mocks.raw.delete(k));}}}));
import storage from './care-storage';
const name='nestwise.cache.user.household';
beforeEach(()=>{mocks.raw.clear();mocks.secure.clear();mocks.fail=false;mocks.counter=0;});
it('migrates legacy plaintext and shares one durable key across concurrent writes',async()=>{
 mocks.raw.set(name,'{"queue":["unsynced"]}');expect(await storage.getItem(name)).toContain('unsynced');expect(mocks.raw.get(name)).not.toContain('unsynced');
 await Promise.all([storage.setItem(name,'one'),storage.setItem('nestwise.meta.user','two')]);
 expect(await storage.getItem(name)).toBe('one');expect(await storage.getItem('nestwise.meta.user')).toBe('two');expect(mocks.secure.size).toBe(1);
});
it('never overwrites saved care when the device key is missing or cannot be saved',async()=>{
 mocks.raw.set(name,'original');mocks.fail=true;await expect(storage.getItem(name)).rejects.toThrow();expect(mocks.raw.get(name)).toBe('original');
 mocks.fail=false;await storage.setItem(name,'private');const encrypted=mocks.raw.get(name);mocks.secure.clear();await expect(storage.getItem(name)).rejects.toThrow('unavailable');await expect(storage.setItem(name,'replacement')).rejects.toThrow();expect(mocks.raw.get(name)).toBe(encrypted);
});
it('removes the device key after sign-out cache deletion',async()=>{await storage.setItem(name,'private');await storage.setItem('nestwise.meta.user','metadata');await storage.multiRemove([name,'nestwise.meta.user']);expect(mocks.secure.size).toBe(0);expect(mocks.raw.size).toBe(0);});
