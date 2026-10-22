import { openDB } from 'idb';
import { validateDatabase } from '../domain/logic';
import { createSeed } from '../data/seed';
import { createWorkspace, validateWorkspace, type ReviewSnapshot } from '../domain/workspace';

// Atomic operational data + workspace snapshot. Separate from the established app store.
let revision = 0;
export const reviewRepository = {
  async connection() {
    return openDB('krypta-design-review', 1, {
      upgrade(db) {
        db.createObjectStore('snapshots');
      }
    });
  },
  async load(): Promise<ReviewSnapshot> {
    const db = await this.connection();
    try {
      const tx = db.transaction('snapshots', 'readwrite');
      let snapshot = (await tx.store.get('main')) as ReviewSnapshot | undefined;
      revision = (await tx.store.get('revision')) ?? 0;
      if (!snapshot) {
        const data = createSeed();
        snapshot = {
          db: data,
          workspace: createWorkspace(data)
        };
        revision = 1;
        await tx.store.put(snapshot, 'main');
        await tx.store.put(revision, 'revision');
      }
      validateDatabase(snapshot.db);
      validateWorkspace(snapshot.workspace, snapshot.db);
      await tx.done;
      return snapshot;
    } finally {
      db.close();
    }
  },
  async save(snapshot: ReviewSnapshot) {
    validateDatabase(snapshot.db);
    validateWorkspace(snapshot.workspace, snapshot.db);
    const db = await this.connection();
    try {
      const tx = db.transaction('snapshots', 'readwrite');
      if ((await tx.store.get('revision')) !== revision) {
        tx.abort();
        await tx.done.catch(() => {});
        throw new Error('Duomenys pakeisti kitame lange. Atnaujinkite puslapį.');
      }
      await tx.store.put(snapshot, 'main');
      await tx.store.put(revision + 1, 'revision');
      await tx.done;
      revision++;
    } finally {
      db.close();
    }
  }
};
