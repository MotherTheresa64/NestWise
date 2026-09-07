import RawStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import { cachePrefix, openCache, sealCache } from './cache-cipher';
const owner=(key:string)=>key.match(/^nestwise\.(?:cache|meta)\.([^.]+)/)?.[1];
const pendingKeys=new Map<string,Promise<Uint8Array>>();
async function keyFor(userId:string,create:boolean):Promise<Uint8Array>{
 const pending=pendingKeys.get(userId);if(pending)return pending;
 const operation=(async()=>{
  const name=`nestwise.cache-key.${userId}`;const saved=await SecureStore.getItemAsync(name);if(saved)return hexToBytes(saved);
  const keys=(await RawStorage.getAllKeys()).filter(key=>owner(key)===userId);
  const records=await RawStorage.multiGet(keys);
  if(!create || records.some(([,value])=>value?.startsWith(cachePrefix)))throw new Error('The device key for saved care is unavailable. Saved data has not been erased.');
  const key=await Crypto.getRandomBytesAsync(32);await SecureStore.setItemAsync(name,bytesToHex(key),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});return key;
 })();pendingKeys.set(userId,operation);
 try{return await operation;}finally{pendingKeys.delete(userId);}
}
async function setItem(storageKey:string,value:string){
 const userId=owner(storageKey);if(Platform.OS==='web'||!userId)return RawStorage.setItem(storageKey,value);
 const key=await keyFor(userId,true);const nonce=await Crypto.getRandomBytesAsync(24);
 await RawStorage.setItem(storageKey,sealCache(value,key,nonce,storageKey));
}
async function getItem(storageKey:string){
 const value=await RawStorage.getItem(storageKey);const userId=owner(storageKey);
 if(value===null||Platform.OS==='web'||!userId)return value;
 if(value.startsWith(cachePrefix))return openCache(value,await keyFor(userId,false),storageKey);
 // Migrate legacy plaintext only after the device key has been durably stored.
 await setItem(storageKey,value);return value;
}
const CareStorage={...RawStorage,getItem,setItem,
 multiGet:async(keys:readonly string[])=>Promise.all(keys.map(async key=>[key,await getItem(key)] as [string,string|null])),
 multiRemove:async(keys:readonly string[])=>{
  await RawStorage.multiRemove(keys);
  if(Platform.OS!=='web')for(const key of keys)if(key.startsWith('nestwise.meta.'))await SecureStore.deleteItemAsync(`nestwise.cache-key.${owner(key)}`);
 }
};
export default CareStorage;
