/** Explicit Telegram import. No publishing, forwarding or automatic scheduling. */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { Api, context, withClient, resolveDialog, apiError } from '@/lib/telegram-user/core';

export const runtime = 'nodejs';
export const maxDuration = 60;
const BUCKET = 'nashra-announcement-images';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 10;

function imageMime(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function isImage(message: Api.Message): boolean {
  const media = message.media;
  if (media instanceof Api.MessageMediaPhoto) return true;
  return media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(media.document.mimeType ?? '');
}
function isOversized(message: Api.Message): boolean {
  const media = message.media;
  return media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document && Number(media.document.size) > MAX_BYTES;
}

export async function POST(req: NextRequest) {
  try {
    const c = await context(req, true);
    const input: unknown = await req.json();
    if (!input || typeof input !== 'object') throw new Error('Requête invalide.');
    const { chatId, messageId } = input as Record<string, unknown>;
    if (typeof chatId !== 'string' || !/^-?\d{3,30}$/.test(chatId)) throw new Error('Discussion Telegram invalide.');
    if (typeof messageId !== 'number' || !Number.isSafeInteger(messageId) || messageId < 1) throw new Error('Message Telegram invalide.');

    const result = await withClient(c, async client => {
      const dialog = await resolveDialog(client, chatId);
      const originals = await client.getMessages(dialog.entity, { ids: [messageId] });
      const selected = originals.find(m => m instanceof Api.Message && m.id === messageId);
      if (!(selected instanceof Api.Message)) throw new Error('Message Telegram inaccessible ou supprimé.');
      let album: Api.Message[] = [selected];
      if (selected.groupedId) {
        const ids = Array.from({ length: 29 }, (_, i) => messageId + i - 14).filter(i => i > 0);
        const neighbors = await client.getMessages(dialog.entity, { ids });
        album = neighbors.filter(m => m instanceof Api.Message &&
          Boolean(m.groupedId) && m.groupedId!.toString() === selected.groupedId!.toString()) as Api.Message[];
        if (!album.some(m => m.id === selected.id)) album.push(selected);
        album.sort((a, b) => a.id - b.id);
      }
      const caption = album.map(m => m.message?.trim()).find(Boolean) || selected.message?.trim() || '';
      const photos = album.filter(isImage);
      const imageUrls: string[] = [];
      const warnings: string[] = [];
      let skipped = Math.max(0, photos.length - MAX_PHOTOS);
      if (skipped) warnings.push(`Album limité à ${MAX_PHOTOS} images.`);
      for (const photo of photos.slice(0, MAX_PHOTOS)) {
        if (isOversized(photo)) { skipped++; warnings.push(`Photo #${photo.id} : plus de 8 Mo.`); continue; }
        try {
          const downloaded = await client.downloadMedia(photo, {});
          if (!Buffer.isBuffer(downloaded) || !downloaded.length || downloaded.length > MAX_BYTES) {
            skipped++; warnings.push(`Photo #${photo.id} : fichier vide ou trop volumineux.`); continue;
          }
          const mime = imageMime(downloaded);
          if (!mime) { skipped++; warnings.push(`Photo #${photo.id} : format non accepté.`); continue; }
          const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
          const key = `${c.userId}/${randomUUID()}.${ext}`;
          const { error } = await c.supabase.storage.from(BUCKET).upload(key, downloaded, {
            contentType: mime, cacheControl: '3600', upsert: false,
          });
          if (error) {
            skipped++;
            warnings.push('Stockage Supabase indisponible : vérifiez le bucket et le script SQL 003.');
            break;
          }
          const { data } = c.supabase.storage.from(BUCKET).getPublicUrl(key);
          imageUrls.push(data.publicUrl);
        } catch (error) {
          skipped++;
          warnings.push(`Photo #${photo.id} : ${apiError(error)}`);
        }
      }
      const unsupported = album.filter(m => m.media && !isImage(m)).length;
      if (unsupported) warnings.push(`${unsupported} média(s) non photographiques non importés.`);
      return {
        text: caption || '[Message Telegram sans texte]', imageUrls,
        albumCount: album.length, photoCount: photos.length, skipped: skipped + unsupported,
        warnings: [...new Set(warnings)].slice(0, 5),
      };
    });
    return NextResponse.json({ ok: true, messageId, ...result });
  } catch (error) {
    return NextResponse.json({ error: apiError(error) }, { status: 400 });
  }
}
