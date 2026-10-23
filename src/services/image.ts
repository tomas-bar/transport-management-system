import { ApiError } from './api-error';
export async function normalizeImage(file: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const signature = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (!signature) throw new ApiError(415, 'Vaizdo turinys neatitinka failo tipo.');
  let image: ImageBitmap;
  try { image = await createImageBitmap(file); }
  catch { throw new ApiError(400, 'Nepavyko perskaityti vaizdo.'); }
  try {
    if (image.width * image.height > 20000000) throw new ApiError(413, 'Nuotrauka per didelė. Rinkitės vaizdą iki 20 megapikselių.');
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new ApiError(400, 'Nepavyko apdoroti vaizdo.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new ApiError(400, 'Nepavyko išsaugoti vaizdo.')), 'image/jpeg', 0.85));
  } finally { image.close(); }
}
