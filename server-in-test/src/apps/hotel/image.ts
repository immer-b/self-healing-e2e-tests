/** Longest edge, in pixels, of a photo after downscaling in the browser. */
export const MAX_EDGE = 1600;
const SMALL_ENOUGH_BYTES = 1_500_000;

/**
 * Phone cameras produce 4000 px, multi-megabyte images. Scale them down to MAX_EDGE as JPEG before
 * uploading so rounds finish quickly on weak Wi-Fi and the room photo stays well under the 5 MB limit.
 * Small images, GIFs (could be animated) and browsers that can't decode them are sent unchanged.
 */
export async function prepareUpload(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
