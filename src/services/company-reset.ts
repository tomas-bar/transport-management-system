import { createEmptyDatabase, createSeed } from '../data/seed.ts';
import { createWorkspace, type ReviewSnapshot } from '../domain/workspace.ts';
import type { WorkspaceCommand } from '../domain/commands.ts';
import { ApiError } from './api-error.ts';

export type CompanyResetMode = 'clear' | 'samples';

/** Generate reset data on the server; never accept an imported snapshot here. */
export function companyResetCommand(before: ReviewSnapshot, input: { mode?: unknown; anchorDate?: unknown; confirmed?: unknown }): Extract<WorkspaceCommand, { type: 'restore' }> {
  if (input?.confirmed !== true || !['clear', 'samples'].includes(String(input?.mode))) throw new ApiError(400, 'Patvirtinkite duomenų išvalymą arba atkūrimą.');
  if (input.mode === 'samples' && (typeof input.anchorDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.anchorDate) || !Number.isFinite(Date.parse(input.anchorDate)) || new Date(input.anchorDate).toISOString().slice(0, 10) !== input.anchorDate)) throw new ApiError(400, 'Pasirinkite tinkamą pradžios datą.');
  const db = input.mode === 'clear' ? createEmptyDatabase(before.db.settings) : createSeed(input.anchorDate as string);
  db.settings = structuredClone(before.db.settings);
  const workspace = createWorkspace(db);
  if (input.mode === 'clear') { workspace.users = []; workspace.preferences = {}; workspace.notifications = []; }
  workspace.printMode = before.workspace.printMode;
  return { type: 'restore', discardPhotos: true, snapshot: { db, workspace } };
}
