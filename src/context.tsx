import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Database } from "./domain/models";
import { product } from "./config";
import { repository } from "./services/repository";
import { Button } from "./components/ui";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
interface Context {
  db: Database;
  commit: (
    mutate: (db: Database) => void,
    message?: string,
  ) => Promise<boolean>;
  busy: boolean;
  notify: (message: string, error?: boolean) => void;
  navigate: (path: string) => void;
  path: string;
}
const AppContext = createContext<Context | null>(null);
export const useApp = () => {
  const v = useContext(AppContext);
  if (!v) throw new Error("Nėra aplikacijos konteksto");
  return v;
};
export function Provider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const current = useRef<Database | null>(null);
  const previous = useRef<Database | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
    undo?: boolean;
  } | null>(null);
  const [path, setPath] = useState(location.hash.slice(1) || "overview");
  useEffect(() => {
    repository
      .load()
      .then((d) => {
        current.current = d;
        setDb(d);
      })
      .catch((e) => setError(String(e)));
    const update = () => setPath(location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (message: string, error = false) =>
    setToast({ message, error });
  async function commit(
    mutate: (db: Database) => void,
    message = "Pakeitimai išsaugoti",
  ) {
    if (lock.current || !current.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      const next = structuredClone(current.current);
      mutate(next);
      await repository.save(next);
      previous.current = current.current;
      current.current = next;
      setDb(next);
      setToast({ message, error: false, undo: true });
      return true;
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Nepavyko išsaugoti duomenų.",
        true,
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const navigate = (path: string) => {
    location.hash = path;
    window.scrollTo(0, 0);
  };
  if (error)
    return (
      <div className="boot-error">
        <h1>Nepavyko atidaryti duomenų saugyklos</h1>
        <p>
          Patikrinkite, ar naršyklėje leidžiama svetainės duomenų saugykla.
          Duomenys nebuvo išvalyti.
        </p>
        <pre>{error}</pre>
        <Button onClick={() => location.reload()}>Bandyti dar kartą</Button>
      </div>
    );
  if (!db)
    return (
      <div className="loading">
        <div className="brand-symbol">k</div>
        <p>Ruošiama „{product.name}“...</p>
      </div>
    );
  return (
    <AppContext.Provider value={{ db, commit, busy, notify, navigate, path }}>
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle2 /> : <CheckCircle2 />}
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={async () => {
                if (previous.current && !lock.current) {
                  const p = previous.current;
                  const ok = await commit(
                    (d) => Object.assign(d, p),
                    "Veiksmas atšauktas",
                  );
                  if (ok) {
                    previous.current = null;
                    setToast({ message: "Veiksmas atšauktas", error: false });
                  }
                }
              }}
            >
              Atšaukti
            </button>
          )}
          <button
            aria-label="Uždaryti pranešimą"
            onClick={() => setToast(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
const AlertCircle2 = AlertCircle;
