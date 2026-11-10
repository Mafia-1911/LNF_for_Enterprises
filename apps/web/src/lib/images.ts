// Browser side of the photo pipeline (plan §6.1): shrink to 1600 px and re-encode as JPEG before
// upload, so phones don't send 10 MB originals. The server re-encodes again and strips metadata.

const MAX_EDGE = 1600;

/** A smaller JPEG of the picked image, or the original file when the browser can't decode it. */
export async function shrinkForUpload(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  });
  return blob ?? file;
}
