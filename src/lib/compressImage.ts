// Avatar defaults. Callers with a different job (a photographed test
// report, which has to stay *readable*, not just recognisable) pass their
// own — see MedicalDocumentsPanel.
const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024; // 5MB — reject before even trying to decode
const MAX_DIMENSION = 400; // avatars are shown small; no reason to store more
const TARGET_BYTES = 500 * 1024; // re-compress harder if still above this

export type CompressImageOptions = {
  maxDimension?: number;
  targetBytes?: number;
  maxOriginalBytes?: number;
};

/**
 * Resizes and JPEG-compresses an image entirely in the browser before
 * upload, so a multi-megabyte phone photo doesn't turn into a multi-
 * megabyte storage cost (and a slow load) for a small profile picture.
 * Typically lands in the tens of KB for a face photo at quality 0.8.
 */
export async function compressImage(file: File, options: CompressImageOptions = {}): Promise<Blob> {
  const maxOriginalBytes = options.maxOriginalBytes ?? MAX_ORIGINAL_BYTES;
  const maxDimension = options.maxDimension ?? MAX_DIMENSION;
  const targetBytes = options.targetBytes ?? TARGET_BYTES;

  if (file.size > maxOriginalBytes) {
    throw new Error(
      `Image is too large. Please choose a file under ${Math.round(maxOriginalBytes / (1024 * 1024))}MB.`
    );
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not process this image. Please try a different file.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  const toBlob = (quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress image."))),
        "image/jpeg",
        quality
      );
    });

  let blob = await toBlob(0.8);
  if (blob.size > targetBytes) {
    // Unusually detailed image (e.g. a busy background) — compress harder
    // once rather than iterating indefinitely, to keep this predictable.
    blob = await toBlob(0.6);
  }

  return blob;
}
