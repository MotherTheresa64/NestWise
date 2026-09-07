/** Optional future photo adapter. No URLs or device paths go into shared care events.
 * Implementations must enforce local encryption, deletion, consent and household authorization
 * before a photo picker or upload control is exposed. Core food logging does not need storage.
 */
export interface PrivatePhotoStore {
  save(input:{householdId:string;eventId:string;bytes:Uint8Array;mimeType:'image/jpeg'|'image/png'}):Promise<{id:string}>;
  read(input:{householdId:string;id:string}):Promise<Uint8Array>;
  remove(input:{householdId:string;id:string}):Promise<void>;
}
