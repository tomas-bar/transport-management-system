import { useEffect, useRef } from 'react';
import { useConfirm } from '../Feedback';
import { allowNavigation, registerNavigationGuard } from '../../services/navigation-guard';

/** Hash navigation also covers browser Back/Forward, not just links owned by the page. */
export function useUnsavedCalculation(dirty: boolean) {
  const confirm = useConfirm();
  const changed = useRef(dirty), ask = useRef(confirm);
  changed.current = dirty; ask.current = confirm;
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!changed.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    const unregister = registerNavigationGuard(() => {
      if (!changed.current) return true;
      return ask.current('Palikti skaičiuoklę? Neišsaugoti scenarijaus ar įkainių pakeitimai bus prarasti.', {
        title: 'Neišsaugoti pakeitimai', confirmLabel: 'Palikti puslapį',
      });
    });
    window.addEventListener('beforeunload', unload);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', unload);
    };
  }, []);
  return { discard: (path: string) => { changed.current = false; allowNavigation(path); } };
}
