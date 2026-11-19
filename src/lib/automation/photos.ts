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


/** Video references are owned, local-only and never arbitrary fetch URLs. */
export const VIDEO_BUCKET = 'nashra-announcement-videos';
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export type StoredVideo = { key: string; extension: 'mp4' };
export function parseStoredVideo(value: unknown, supabaseUrl: string, ownerUserId?: string): StoredVideo {
  if (typeof value !== 'string' || !supabaseUrl) throw new PhotoReferenceError('Vidéo Nashra invalide.');
  let url: URL; let base: URL;
  try { url = new URL(value); base = new URL(supabaseUrl); }
  catch { throw new PhotoReferenceError('URL de vidéo invalide.'); }
  const prefix = `${base.pathname.replace(/\/$/, '')}/storage/v1/object/public/${VIDEO_BUCKET}/`;
  if (base.protocol !== 'https:' || url.origin !== base.origin || url.search || url.hash ||
      url.username || url.password || !url.pathname.startsWith(prefix))
    throw new PhotoReferenceError('Seules les vidéos MP4 importées dans Nashra sont publiables.');
  const key = url.pathname.slice(prefix.length);
  const match = /^([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\.mp4$/i.exec(key);
  if (!match || (ownerUserId && match[1].toLowerCase() !== ownerUserId.toLowerCase()))
    throw new PhotoReferenceError('Vidéo appartenant à un autre utilisateur ou chemin invalide.');
  return { key, extension: 'mp4' };
}
export function isMp4(bytes: Uint8Array): boolean {
  // ISO BMFF ftyp marker, accepted MP4 brand identifiers only.
  if (bytes.length < 12 || bytes[4] !== 102 || bytes[5] !== 116 || bytes[6] !== 121 || bytes[7] !== 112) return false;
  const brand = String.fromCharCode(...bytes.slice(8, 12));
  return ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'MSNV', 'dash'].includes(brand);
}

/** Read the ISO BMFF movie header without executing a codec or trusting client metadata.
 * Non-fragmented MP4s from browsers/FFmpeg have moov/mvhd with duration.
 * Reject unknown/fragmented containers rather than accidentally sending unbounded media.
 */
export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  if (!isMp4(bytes) || bytes.length < 32) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read32 = (offset: number) => view.getUint32(offset, false);
  const typeAt = (offset: number) => String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  const findBoxes = (start: number, limit: number, wanted: string): [number, number] | null => {
    let at = start;
    while (at + 8 <= limit) {
      let size = read32(at);
      const type = typeAt(at + 4);
      let header = 8;
      if (size === 1) {
        if (at + 16 > limit) return null;
        const large = view.getBigUint64(at + 8, false);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        size = Number(large);
        header = 16;
      } else if (size === 0) size = limit - at;
      if (size < header || at + size > limit) return null;
      if (type === wanted) return [at + header, at + size];
      at += size;
    }
    return null;
  };
  const moov = findBoxes(0, bytes.length, 'moov');
  if (!moov) return null;
  const mvhd = findBoxes(moov[0], moov[1], 'mvhd');
  if (!mvhd) return null;
  const start = mvhd[0];
  const version = bytes[start];
  let timescale: number, duration: number;
  if (version === 0 && start + 20 <= mvhd[1]) {
    timescale = read32(start + 12);
    duration = read32(start + 16);
  } else if (version === 1 && start + 32 <= mvhd[1]) {
    timescale = read32(start + 20);
    const large = view.getBigUint64(start + 24, false);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    duration = Number(large);
  } else return null;
  const seconds = duration / timescale;
  return Number.isFinite(seconds) && timescale > 0 && seconds > 0 ? seconds : null;
}
