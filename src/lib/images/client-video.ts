/** Browser-only video metadata, poster creation and bounded FFmpeg.wasm compression.
 * No Vercel transcoding function, no paid storage processor, no arbitrary URL fetch.
 */
export const MAX_VIDEO_SOURCE_BYTES = 80 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SEC = 90;
export type VideoMeta = { duration: number; width: number; height: number };

function waitFor(video: HTMLVideoElement, successEvent: 'loadedmetadata' | 'seeked', timeoutMs = 12000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('Lecture vidéo trop lente ou format non reconnu.')), timeoutMs);
    function finish(error?: Error) {
      window.clearTimeout(timer);
      video.removeEventListener(successEvent, ok);
      video.removeEventListener('error', fail);
      if (error) reject(error); else resolve();
    }
    function ok() { finish(); }
    function fail() { finish(new Error('Cette vidéo ne peut pas être lue dans le navigateur.')); }
    video.addEventListener(successEvent, ok, { once: true });
    video.addEventListener('error', fail, { once: true });
  });
}

export async function inspectVideo(file: File): Promise<{ meta: VideoMeta; thumbnail: Blob | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  try {
    video.src = url;
    if (video.readyState < 1) await waitFor(video, 'loadedmetadata');
    const duration = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!Number.isFinite(duration) || duration <= 0 || !width || !height) throw new Error('Métadonnées vidéo invalides.');
    if (duration > MAX_VIDEO_DURATION_SEC) throw new Error('La vidéo dépasse 90 secondes. Raccourcissez-la avant importation.');
    if (width * height > 3840 * 2160) throw new Error('Vidéo trop grande : résolution maximale 4K.');
    const meta = { duration, width, height };
    let thumbnail: Blob | null = null;
    try {
      const target = Math.min(Math.max(duration * 0.12, 0.1), Math.max(0.1, duration - 0.05), 1.5);
      if (video.readyState < 2 || Math.abs(video.currentTime - target) > 0.05) {
        video.currentTime = target;
        await waitFor(video, 'seeked', 12000);
      }
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 480 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      thumbnail = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.72));
    } catch { /* A poster failure must not turn a usable video into a broken upload. */ }
    return { meta, thumbnail };
  } finally {
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
  }
}

/** Loading the UMD distribution as static files avoids Turbopack attempting
 * to resolve FFmpeg's dynamically constructed Worker URL at build time.
 * The two UMD JS assets are copied to /public/vendor/ffmpeg by INSTALLER_077_FIX.ps1.
 */
import type { FFmpeg as FFmpegInstance } from '@ffmpeg/ffmpeg';

type FFmpegWindow = Window & { FFmpegWASM?: { FFmpeg: new () => FFmpegInstance } };
let ffmpegScriptPromise: Promise<new () => FFmpegInstance> | null = null;

function loadBrowserFFmpeg(): Promise<new () => FFmpegInstance> {
  if (typeof window === 'undefined') throw new Error('FFmpeg est disponible uniquement dans le navigateur.');
  const existing = (window as FFmpegWindow).FFmpegWASM?.FFmpeg;
  if (existing) return Promise.resolve(existing);
  if (!ffmpegScriptPromise) {
    ffmpegScriptPromise = new Promise<new () => FFmpegInstance>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/ffmpeg/ffmpeg.js';
      script.async = true;
      script.onload = () => {
        const FFmpegConstructor = (window as FFmpegWindow).FFmpegWASM?.FFmpeg;
        if (FFmpegConstructor) resolve(FFmpegConstructor);
        else reject(new Error('Moteur FFmpeg chargé mais non disponible.'));
      };
      script.onerror = () => reject(new Error('Impossible de charger le moteur FFmpeg.'));
      document.head.appendChild(script);
    }).catch(error => { ffmpegScriptPromise = null; throw error; });
  }
  return ffmpegScriptPromise!;
}

/** Lazily loads the 31MB single-thread FFmpeg core only when optimisation is required.
 * FFmpeg runs inside the user's browser, so Vercel never handles large uploads.
 */
export async function compressVideo(file: File, onProgress: (fraction: number) => void): Promise<File> {
  const FFmpeg = await loadBrowserFFmpeg();
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();
  ffmpeg.on('progress', ({ progress }) => onProgress(Math.max(0, Math.min(0.99, progress))));
  try {
    // Official single-thread UMD core, no SharedArrayBuffer or cross-origin-isolation required.
    const core = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${core}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${core}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    await ffmpeg.writeFile('input.mp4', await fetchFile(file));
    const code = await ffmpeg.exec([
      '-i', 'input.mp4', '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2',
      '-r', '24', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '29',
      '-maxrate', '1600k', '-bufsize', '3200k', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', 'output.mp4',
    ], 180000);
    if (code !== 0) throw new Error('Le moteur vidéo ne peut pas encoder ce fichier.');
    const bytes = await ffmpeg.readFile('output.mp4');
    if (typeof bytes === 'string' || bytes.byteLength < 12) throw new Error('Le fichier compressé est vide.');
    const copy = new Uint8Array(bytes).buffer;
    const output = new File([copy], file.name.replace(/\.[^.]+$/, '') + '-nashra.mp4', { type: 'video/mp4' });
    onProgress(1);
    // Compression is useful only when actually smaller; respect the existing storage cap.
    return output.size < file.size ? output : file;
  } finally {
    ffmpeg.terminate();
  }
}
