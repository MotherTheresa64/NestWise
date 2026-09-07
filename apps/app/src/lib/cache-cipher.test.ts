import { expect, it } from 'vitest';
import { openCache, sealCache } from './cache-cipher';
const key=Uint8Array.from({length:32},(_,i)=>i);const nonce=Uint8Array.from({length:24},(_,i)=>i+1);
it('round trips Unicode care and pending mutations without exposing plaintext',()=>{const source=JSON.stringify({notes:'River 🌿 café',queue:[{notes:'Pending private care'}]});const encrypted=sealCache(source,key,nonce,'nestwise.cache.user.household');expect(encrypted).not.toContain('Pending');expect(openCache(encrypted,key,'nestwise.cache.user.household')).toBe(source);});
it('rejects wrong keys, altered records and cross-household substitution without returning partial plaintext',()=>{const encrypted=sealCache('private',key,nonce,'household-a');expect(()=>openCache(encrypted,new Uint8Array(32),'household-a')).toThrow();expect(()=>openCache(encrypted,key,'household-b')).toThrow();expect(()=>openCache(encrypted.slice(0,-2)+'00',key,'household-a')).toThrow();});
it('fresh nonces produce distinct authenticated records',()=>{expect(sealCache('same',key,nonce,'a')).not.toBe(sealCache('same',key,new Uint8Array(24),'a'));});
