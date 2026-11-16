/** Browser-only thumbnail generation, with no paid image transform service. */
export async function makeThumbnail(file: Blob): Promise<Blob | null> {
  if (typeof window === 'undefined' || !('createImageBitmap' in window)) return null;
  let image: ImageBitmap | null = null;
  try {
    image = await createImageBitmap(file);
    if (!image.width || !image.height || image.width * image.height > 36_000_000) return null;
    const scale = Math.min(1, 480 / image.width);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const thumbnail = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.72));
    return thumbnail?.type === 'image/webp' && thumbnail.size > 0 && thumbnail.size < file.size
      ? thumbnail : null;
  } catch {
    return null;
  } finally {
    image?.close();
  }
}
