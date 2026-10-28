/**
 * Strict local media references for server-side publishing.
 * This module never fetches arbitrary URLs. Stored photos must be from the
 * user's own folder in the Nashra Supabase Storage bucket (SQL migration 003).
 */
export const PHOTO_BUCKET = 'nashra-announcement-images';
export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export type StoredPhoto = { key: string; extension: 'jpg' | 'png' | 'webp' };

export class PhotoReferenceError extends Error {}

export function parseStoredPhotos(
  urls: unknown,
  supabaseUrl: string,
  ownerUserId?: string,
): StoredPhoto[] {
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > MAX_PHOTOS) {
    throw new PhotoReferenceError(`Album invalide : entre 1 et ${MAX_PHOTOS} photos nécessaires.`);
  }
  if (!supabaseUrl) throw new PhotoReferenceError('URL Supabase manquante.');
  let base: URL;
  try { base = new URL(supabaseUrl); }
  catch { throw new PhotoReferenceError('URL Supabase invalide.'); }
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) {
    throw new PhotoReferenceError('Configuration Supabase invalide.');
  }
  const prefix = `${base.pathname.replace(/\/$/, '')}/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const found = new Set<string>();
  return urls.map(value => {
    if (typeof value !== 'string') throw new PhotoReferenceError('Lien photo invalide.');
    let url: URL;
    try { url = new URL(value); }
    catch { throw new PhotoReferenceError('Lien photo invalide.'); }
    if (url.origin !== base.origin || url.username || url.password || url.search || url.hash ||
        !url.pathname.startsWith(prefix)) {
      throw new PhotoReferenceError('Photo externe non publiable : importez-la dans Nashra depuis votre ordinateur.');
    }
    const key = url.pathname.slice(prefix.length);
    // V1.3 and Telegram V2 import use exactly UUID/UUID.ext.
    // Reject encoded slashes, traversal, and other owners' folders.
    const match = /^([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\.(jpg|png|webp)$/i.exec(key);
    if (!match) throw new PhotoReferenceError('Chemin de photo incorrect : réimportez le fichier dans Nashra.');
    if (ownerUserId && match[1].toLowerCase() !== ownerUserId.toLowerCase()) {
      throw new PhotoReferenceError('Photo appartenant à un autre compte : envoi interdit.');
    }
    if (found.has(key.toLowerCase())) throw new PhotoReferenceError('La même photo est présente plusieurs fois.');
    found.add(key.toLowerCase());
    return { key, extension: match[3].toLowerCase() as StoredPhoto['extension'] };
  });
}

/** MIME verification from bytes; do not trust URL extension or storage metadata. */
export function imageExtension(bytes: Uint8Array): StoredPhoto['extension'] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'png';
  if (bytes.length >= 12 && [82, 73, 70, 70].every((v, i) => bytes[i] === v) && [87, 69, 66, 80].every((v, i) => bytes[i + 8] === v)) return 'webp';
  return null;
}
