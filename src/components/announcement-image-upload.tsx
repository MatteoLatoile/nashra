'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ImagePlus, LoaderCircle, ShieldCheck, UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { makeThumbnail } from '@/lib/images/client-thumbnail';
import { optimizeImage, MAX_PHOTO_SOURCE_BYTES } from '@/lib/images/client-optimize';

const BUCKET = 'nashra-announcement-images';
const LIMIT_BYTES = MAX_PHOTO_SOURCE_BYTES;
const MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function AnnouncementImageUpload({
  currentCount,
  maxCount,
  onUploaded,
  onBusyChange,
  disabled = false,
}: {
  currentCount: number;
  maxCount: number;
  onUploaded: (urls: string[], thumbnails: Record<string, string>) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState('');
  const remaining = Math.max(0, maxCount - currentCount);

  async function upload(files: File[]) {
    if (busy || disabled || !files.length) return;
    setFeedback('');
    if (files.length > remaining) {
      setFeedback(`Seulement ${remaining} image${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''} (maximum ${maxCount}).`);
      return;
    }
    const invalid = files.find(file => !MIMES[file.type] || file.size > LIMIT_BYTES || file.size === 0);
    if (invalid) {
      setFeedback('Formats acceptés : JPG, PNG, WebP. Source : 24 Mo maximum par photo.');
      return;
    }
    setBusy(true); onBusyChange?.(true);
    const uploaded: string[] = [];
    const thumbnails: Record<string, string> = {};
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error('Connectez-vous à Nashra pour importer vos photos.');
      let savedBytes = 0;
      for (const original of files) {
        const optimized = await optimizeImage(original);
        const file = optimized.file;
        savedBytes += optimized.savedBytes;
        const ext = MIMES[file.type];
        const key = `${data.user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(key, file, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false,
        });
        if (error) throw error;
        const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(key);
        uploaded.push(publicData.publicUrl);
        // A failed thumbnail must never invalidate the original image upload.
        // Storage keys stay scoped to the authenticated user, like originals.
        try {
          const thumb = await makeThumbnail(file);
          if (thumb && thumb.size > 0 && thumb.size < file.size) {
            const thumbKey = `${data.user.id}/${crypto.randomUUID()}-thumb.webp`;
            const { error: thumbError } = await supabase.storage.from(BUCKET).upload(thumbKey, thumb, {
              contentType: 'image/webp', cacheControl: '31536000', upsert: false,
            });
            if (!thumbError) {
              thumbnails[publicData.publicUrl] = supabase.storage.from(BUCKET).getPublicUrl(thumbKey).data.publicUrl;
            }
          }
        } catch { /* Original image remains usable; preview falls back safely. */ }
      }
      onUploaded(uploaded, thumbnails);
      setFeedback(`${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} ajoutée${uploaded.length > 1 ? 's' : ''}${savedBytes ? ` · ${(savedBytes / (1024 * 1024)).toFixed(1)} Mo économisé(s)` : ''}. Enregistrez l’annonce pour conserver les liens.`);
    } catch (err) {
      // Keep uploaded links even when a later file fails, preventing silent orphaned uploads.
      if (uploaded.length) onUploaded(uploaded, thumbnails);
      const reason = err instanceof Error ? err.message : 'Erreur inconnue';
      setFeedback(`Import interrompu : ${reason}. Vérifiez que le SQL Storage a été exécuté dans Supabase.`);
    } finally {
      setBusy(false); onBusyChange?.(false);
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    void upload(files);
  }
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void upload(Array.from(event.dataTransfer.files || []));
  }

  return (
    <div className="n13-upload-wrap">
      <div
        className={`n13-dropzone${dragging ? ' n13-dragging' : ''}${busy ? ' n13-loading' : ''}`}
        onDragOver={event => { event.preventDefault(); if (!busy && !disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="n13-drop-icon">{busy ? <LoaderCircle size={21} className="n13-spinner"/> : <ImagePlus size={21}/>}</span>
        <div className="n13-drop-copy">
          <strong>{busy ? 'Importation des photos…' : 'Ajouter des photos depuis votre ordinateur'}</strong>
          <span>Glissez-déposez vos images ici, ou utilisez le bouton. JPG, PNG, WebP · 24 Mo avant optimisation · 8 Mo après</span>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleFiles} aria-label="Choisir les images à ajouter" />
        <button type="button" className="n13-pick" disabled={busy || disabled || remaining === 0} onClick={() => input.current?.click()}>
          <UploadCloud size={15}/>{busy ? 'En cours' : 'Choisir'}
        </button>
      </div>
      <div className="n13-upload-bottom">
        <span><ShieldCheck size={13}/> Images publiques par lien, enregistrées dans votre espace de stockage Supabase.</span>
        <span>{currentCount}/{maxCount} photos</span>
      </div>
      {feedback && <p className="n13-upload-feedback" role="status">{feedback}</p>}
    </div>
  );
}
