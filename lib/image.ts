const MAX_SIDE = 900;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * Turns an uploaded photo into a compact JPEG data URL for use as an avatar.
 * Downscaling keeps each character small enough to save with the account.
 */
export async function fileToAvatar(file: File, maxSide = MAX_SIDE): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('ไฟล์นี้ไม่ใช่รูปภาพ');
  if (file.size > MAX_INPUT_BYTES) throw new Error('รูปใหญ่เกิน 20MB');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG');
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}
