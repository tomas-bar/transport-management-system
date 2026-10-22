export type PreviewMode = 'read' | 'act';

export interface WorkspaceSession {
  userId: string;
  returnTo?: string;
  returnRole?: 'owner' | 'admin';
  actorName?: string;
  mode?: PreviewMode;
}

export interface PreviewOptions {
  companyId?: string;
  mode?: PreviewMode;
}

export function readOnlySession(session: WorkspaceSession | null) {
  return !!session?.returnTo && session.mode !== 'act';
}
