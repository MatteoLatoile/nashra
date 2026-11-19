/** Local photo optimisation only. Never uploads the unoptimised file without consent. */
export const MAX_PHOTO_SOURCE_BYTES = 24 * 1024 * 1024;
export const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 36_000_000;
const MAX_EDGE = 2048;

export type OptimizedImage = { file: File; savedBytes: number };

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export async function optimizeImage(file: File): Promise<OptimizedImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > MAX_PHOTO_SOURCE_BYTES) {
    throw new Error('Image JPG, PNG ou WebP requise (24 Mo maximum avant optimisation).');
  }
  if (typeof createImageBitmap !== 'function') {
    if (file.size <= MAX_PHOTO_UPLOAD_BYTES) return { file, savedBytes: 0 };
    throw new Error('Ce navigateur ne peut pas optimiser cette image. Essayez Chrome ou Edge.');
  }
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error('Image trop grande (36 millions de pixels maximum).');
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    // Keep alpha in PNG/WebP; regular photographs stay JPEG for Telegram compatibility.
    const targetType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const extension = targetType === 'image/jpeg' ? 'jpg' : 'webp';
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Optimisation des images indisponible.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const result = await canvasBlob(canvas, targetType, 0.82);
    if (!result || result.size === 0) throw new Error('Impossible de générer l’image optimisée.');
    // Never increase payload or discard a good original needlessly.
    const selected = result.size < file.size
      ? new File([result], file.name.replace(/\.[^.]+$/, '') + '.' + extension, { type: targetType })
      : file;
    if (selected.size > MAX_PHOTO_UPLOAD_BYTES) throw new Error('L’image dépasse 8 Mo après optimisation. Réduisez sa taille.');
    return { file: selected, savedBytes: Math.max(0, file.size - selected.size) };
  } finally {
    bitmap?.close();
  }
}
