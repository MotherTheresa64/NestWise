import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes, utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';
export const cachePrefix = 'nestwise-encrypted-v1:';
export function sealCache(value: string, key: Uint8Array, nonce: Uint8Array, storageKey: string): string {
 const ciphertext=xchacha20poly1305(key,nonce,utf8ToBytes(storageKey)).encrypt(utf8ToBytes(value));
 return cachePrefix+bytesToHex(nonce)+':'+bytesToHex(ciphertext);
}
export function openCache(value: string, key: Uint8Array, storageKey: string): string {
 if(!value.startsWith(cachePrefix))throw new Error('Unrecognized care cache format.');
 const [nonce,ciphertext,...extra]=value.slice(cachePrefix.length).split(':');
 if(extra.length || !nonce || !ciphertext)throw new Error('Care cache is damaged. It has not been discarded.');
 try{return bytesToUtf8(xchacha20poly1305(key,hexToBytes(nonce),utf8ToBytes(storageKey)).decrypt(hexToBytes(ciphertext)));}
 catch{throw new Error('Care cache could not be unlocked. It has not been discarded.');}
}
