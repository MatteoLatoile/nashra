'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { compressVideo, inspectVideo, MAX_VIDEO_SOURCE_BYTES, MAX_VIDEO_UPLOAD_BYTES, type VideoMeta } from '@/lib/images/client-video';

const VIDEO_BUCKET = 'nashra-announcement-videos';
const POSTER_BUCKET = 'nashra-announcement-images';
const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;

export function AnnouncementVideoUpload({ value, thumbnailUrl, onChange, onBusyChange, disabled = false }: {
  value?: string;
  thumbnailUrl?: string;
  onChange: (url: string, thumbnailUrl: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [message, setMessage] = useState('');
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [localPreview, setLocalPreview] = useState('');
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [optimize, setOptimize] = useState(true);
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy || disabled) return;
    if (file.type !== 'video/mp4' || !file.name.toLowerCase().endsWith('.mp4') || file.size < 12 || file.size > MAX_VIDEO_SOURCE_BYTES) {
      setMessage('Choisissez un MP4 de 80 Mo maximum avant optimisation.');
      return;
    }
    setBusy(true); onBusyChange?.(true); setMessage(''); setPhase('Analyse du fichier…'); setProgress(0); setMeta(null);
    const previewUrl = URL.createObjectURL(file);
    setLocalPreview(previous => { if (previous) URL.revokeObjectURL(previous); return previewUrl; });
    setOriginalSize(file.size);
    try {
      const { meta: media, thumbnail } = await inspectVideo(file);
      setMeta(media);
      // Run FFmpeg on demand; small already-compatible MP4 files go straight to upload.
      let candidate = file;
      let optimizationWarning = '';
      if (optimize && file.size > 10 * 1024 * 1024) {
        setPhase('Compression FFmpeg dans votre navigateur (chargement initial du moteur possible)…');
        try {
          candidate = await compressVideo(file, fraction => setProgress(Math.round(fraction * 100)));
        } catch {
          if (file.size > MAX_VIDEO_UPLOAD_BYTES) throw new Error('Compression impossible. Essayez Chrome/Edge sur ordinateur ou utilisez un MP4 de 20 Mo maximum.');
          optimizationWarning = ' Optimisation indisponible : original conservé.';
        }
      }
      if (candidate.size > MAX_VIDEO_UPLOAD_BYTES) {
        throw new Error(`La vidéo fait ${mb(candidate.size)} après optimisation (20 Mo maximum). Réduisez sa durée ou sa résolution.`);
      }
      setPhase('Envoi de la vidéo vers Nashra…');
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Connexion requise.');
      const key = `${user.id}/${crypto.randomUUID()}.mp4`;
      const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(key, candidate, {
        contentType: 'video/mp4', cacheControl: '3600', upsert: false,
      });
      if (error) throw error;
      const videoUrl = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(key).data.publicUrl;
      // Poster is a separate lightweight WebP; its failure does not invalidate the video.
      let poster = '';
      if (thumbnail?.size && thumbnail.size < 1024 * 1024) {
        setPhase('Création de la miniature…');
        try {
          const posterKey = `${user.id}/${crypto.randomUUID()}-thumb.webp`;
          const { error: thumbError } = await supabase.storage.from(POSTER_BUCKET).upload(posterKey, thumbnail, {
            contentType: 'image/webp', cacheControl: '31536000', upsert: false,
          });
          if (!thumbError) poster = supabase.storage.from(POSTER_BUCKET).getPublicUrl(posterKey).data.publicUrl;
        } catch { /* Video remains valid even without poster. */ }
      }
      onChange(videoUrl, poster);
      setMessage(`Vidéo importée : ${mb(file.size)} → ${mb(candidate.size)} · ${media.duration.toFixed(1)} s.${optimizationWarning} Enregistrez l’annonce.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Importation impossible.');
    } finally {
      setBusy(false); onBusyChange?.(false); setPhase(''); setProgress(0);
    }
  }

  return <div className="n13-upload-wrap">
    <input ref={input} type="file" accept="video/mp4,.mp4" hidden onChange={event => void upload(event)}/>
    <label className="n77-optimize"><input type="checkbox" checked={optimize} disabled={busy} onChange={event => setOptimize(event.target.checked)}/>
      Optimiser les vidéos lourdes avec FFmpeg (dans mon navigateur, sans serveur payant)
    </label>
    <button className="btn btn-secondary" type="button" disabled={busy || disabled}
      onClick={() => input.current?.click()}>{busy ? 'Traitement en cours…' : 'Choisir une vidéo MP4 (80 Mo avant compression)'}</button>
    {phase && <p role="status" className="n77-media-progress">{phase} {progress > 0 && progress < 100 ? `≈ ${progress} %` : ''}</p>}
    {busy && <progress value={progress} max={100} aria-label="Progression estimée de la compression vidéo"/>}
    {meta && <small>Vidéo : {meta.width} × {meta.height} · {meta.duration.toFixed(1)} s{originalSize ? ` · ${mb(originalSize)}` : ''}</small>}
    {(localPreview || value) && <div className="n77-video-preview">
      <video key={localPreview || value} src={localPreview || value} controls playsInline preload="metadata" poster={thumbnailUrl || undefined}/>
      {value && !busy && <button className="btn btn-secondary" type="button" onClick={() => { onChange('', ''); setLocalPreview(''); setMeta(null); setOriginalSize(null); }}>Retirer la vidéo</button>}
    </div>}
    {message && <p role="status" className="n13-upload-feedback">{message}</p>}
    <small>1 MP4 par annonce · 90 s maximum · 20 Mo après optimisation. Première compression : téléchargement du moteur FFmpeg (~31 Mo), potentiellement lent. Vidéos publiques par lien.</small>
  </div>;
}
