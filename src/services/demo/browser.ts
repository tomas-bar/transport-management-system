import { openDB } from 'idb';
import { reviewRepository } from '../review-repository';
import { validateDatabase } from '../../domain/logic';
import { validateWorkspace } from '../../domain/workspace';
import { ApiError } from '../api-error';
import { DemoApi } from './api';
import { createDemoState, type DemoState, type DemoStorage } from './model';

const connection = openDB('krypta-demo', 1, {
  upgrade(db) { db.createObjectStore('state'); db.createObjectStore('photos'); },
});
let initializing: Promise<DemoState> | undefined;
const storage: DemoStorage = {
  async read() {
    const db = await connection;
    let state = await db.get('state', 'main') as DemoState | undefined;
    if (!state) {
      // Copy the previous browser workspace once. Never overwrite it or replace edited data.
      initializing ??= reviewRepository.load().then(snapshot => createDemoState(snapshot));
      const candidate = await initializing;
      const tx = db.transaction('state', 'readwrite');
      state = await tx.store.get('main') as DemoState | undefined;
      if (!state) { state = candidate; await tx.store.put(state, 'main'); }
      await tx.done;
    }
    if (state.version !== 1) throw new Error('Šios saugyklos versija nepalaikoma. Duomenys nepakeisti.');
    for (const company of state.companies) {
      validateDatabase(company.snapshot.db); validateWorkspace(company.snapshot.workspace, company.snapshot.db);
    }
    return state;
  },
  async save(state, generation, photo) {
    const db = await connection, tx = db.transaction(['state', 'photos'], 'readwrite');
    const previous = await tx.objectStore('state').get('main') as DemoState | undefined;
    if (previous?.generation !== generation) {
      tx.abort(); await tx.done.catch(() => {});
      throw new ApiError(409, 'Duomenys pakeisti kitame lange. Atnaujinkite puslapį.');
    }
    await tx.objectStore('state').put(state, 'main');
    if (photo) {
      if (photo.blob) await tx.objectStore('photos').put(photo.blob, photo.id);
      else await tx.objectStore('photos').delete(photo.id);
    }
    await tx.done;
  },
  async photo(id) { return (await connection).get('photos', id); },
};

async function normalizeImage(file: Blob): Promise<Blob> {
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
const engine = new DemoApi(storage, {
  get: () => sessionStorage.getItem('krypta-demo-session'),
  set: id => { if (id) sessionStorage.setItem('krypta-demo-session', id); else sessionStorage.removeItem('krypta-demo-session'); },
  device: () => navigator.userAgent.slice(0, 200),
}, normalizeImage);
const imageUrls = new Map<string, string>();

export async function demoApi<T>(path: string, method: string, input?: unknown): Promise<T> {
  try {
    const result = await engine.request(path, method, input);
    if (path.startsWith('/api/photos?') && method === 'GET') {
      for (const row of result) {
        if (!imageUrls.has(row.id)) imageUrls.set(row.id, URL.createObjectURL(await engine.request<Blob>('/api/photos/' + row.id)));
        row.url = imageUrls.get(row.id);
      }
    }
    if (method === 'DELETE' && path.startsWith('/api/photos/')) {
      const id = path.split('/')[3], url = imageUrls.get(id);
      if (url) URL.revokeObjectURL(url); imageUrls.delete(id);
    }
    if (path === '/api/logout') { for (const url of imageUrls.values()) URL.revokeObjectURL(url); imageUrls.clear(); }
    return result as T;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && path !== '/api/login') window.dispatchEvent(new Event('krypta-session-ended'));
    if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new ApiError(413, 'Naršyklės saugykla pilna. Pašalinkite nereikalingas nuotraukas arba įrašus.');
    throw error;
  }
}
