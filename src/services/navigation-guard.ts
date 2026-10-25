type NavigationGuard = () => boolean | Promise<boolean>;
let guard: NavigationGuard | null = null;
let allowedPath: string | null = null;
let pending = false;

export function registerNavigationGuard(next: NavigationGuard) {
  guard = next;
  return () => { if (guard === next) guard = null; };
}
export function allowNavigation(path: string) { allowedPath = path; }

/** Providers must consult the guard before changing React's route and unmounting the form. */
export function guardedHashNavigation(commit: (path: string) => void) {
  return (event: HashChangeEvent) => {
    const destination = new URL(event.newURL).hash.slice(1) || 'overview';
    const previous = new URL(event.oldURL).hash || '#overview';
    if (pending) { history.replaceState(history.state, '', previous); return; }
    if (allowedPath === destination) { allowedPath = null; commit(destination); return; }
    const decision = guard?.() ?? true;
    if (decision === true) { commit(destination); return; }
    history.replaceState(history.state, '', previous);
    if (decision === false) return;
    pending = true;
    void decision.then(leave => {
      pending = false;
      if (!leave) return;
      history.replaceState(history.state, '', '#' + destination);
      commit(destination);
    }).catch(() => { pending = false; });
  };
}
