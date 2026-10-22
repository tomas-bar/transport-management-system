import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useApp } from '../context';
import { Button, Modal } from './ui';

export function Toast({ message, error, onClose }: {
  message: string;
  error: boolean;
  onClose: () => void;
}) {
  return createPortal(
    <div className={`app-toast ${error ? 'is-error' : 'is-success'}`}>
      {error ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      <p className="app-toast-message" role={error ? 'alert' : 'status'} aria-atomic="true">{message}</p>
      <button type="button" aria-label="Uždaryti pranešimą" onClick={onClose}><X size={20} /></button>
    </div>,
    document.body,
  );
}

interface ConfirmationOptions {
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
}
type Confirm = (message: string, options?: ConfirmationOptions) => Promise<boolean>;
const ConfirmationContext = createContext<Confirm | null>(null);

export function useConfirm() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error('Missing confirmation context');
  return confirm;
}

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const { path, user } = useApp();
  const [prompt, setPrompt] = useState<({ message: string } & ConfirmationOptions) | null>(null);
  const pending = useRef<((answer: boolean) => void) | null>(null);

  const settle = (answer: boolean) => {
    pending.current?.(answer);
    pending.current = null;
    setPrompt(null);
  };
  useEffect(() => { settle(false); }, [path, user?.id]);
  useEffect(() => () => { pending.current?.(false); }, []);

  const confirm: Confirm = (message, options = {}) => {
    pending.current?.(false);
    setPrompt({ message, ...options });
    return new Promise(resolve => { pending.current = resolve; });
  };

  return <ConfirmationContext.Provider value={confirm}>
    {children}
    {prompt && createPortal(
      <Modal title={prompt.title ?? 'Patvirtinkite veiksmą'} onClose={() => settle(false)}>
        <div className="modal-body confirmation-message"><p>{prompt.message}</p></div>
        <footer>
          <Button variant="secondary" onClick={() => settle(false)}>Atšaukti</Button>
          <Button variant={prompt.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
            {prompt.confirmLabel ?? 'Patvirtinti'}
          </Button>
        </footer>
      </Modal>,
      document.body,
    )}
  </ConfirmationContext.Provider>;
}
