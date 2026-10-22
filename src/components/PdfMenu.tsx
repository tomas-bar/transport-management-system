import { useEffect, useRef, useState } from "react";
import {
  Printer,
  ChevronDown,
  FileText,
  Route,
  Users,
  Package,
} from "lucide-react";
import type { Database, Trip } from "../domain/models";
import type { DocumentFonts, TripDocument } from "../services/pdf/documents";
import { useApp } from "../context";
import { Button } from "./ui";

let fontsPromise: Promise<DocumentFonts> | null = null;
function loadFonts() {
  if (!fontsPromise)
    fontsPromise = Promise.all(
      ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map(async (name) => {
        const response = await fetch(`/fonts/${name}`);
        if (!response.ok) throw new Error("Nepavyko įkelti PDF šrifto.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
      }),
    )
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((e) => {
        fontsPromise = null;
        throw e;
      });
  return fontsPromise;
}

export function PdfMenu({
  trip,
  period,
}: {
  trip?: Trip;
  period?: { from: string; to: string };
}) {
  const { db, notify } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const click = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
  async function generate(kind: TripDocument | "finance") {
    // Open synchronously to preserve the browser's user-gesture allowance.
    const preview = window.open("about:blank", "_blank");
    if (preview) {
      preview.document.title = "Ruošiamas PDF";
      const p = preview.document.createElement("p");
      p.textContent = "Ruošiamas PDF...";
      preview.document.body.appendChild(p);
    }
    setOpen(false);
    setBusy(true);
    try {
      const [fonts, pdf] = await Promise.all([
        loadFonts(),
        import("../services/pdf/documents"),
      ]);
      const snapshot = structuredClone(db) as Database;
      const doc =
        kind === "finance" && period
          ? pdf.buildFinancePdf(snapshot, period.from, period.to, fonts)
          : trip
            ? pdf.buildTripPdf(snapshot, trip, kind as TripDocument, fonts)
            : null;
      if (!doc) throw new Error("PDF duomenys nerasti.");
      const fileName =
        kind === "finance"
          ? `finansai-${period?.from}.pdf`
          : `${trip?.number}-${kind}.pdf`;
      const blob = doc.output("blob");
      const url = URL.createObjectURL(
        new Blob([blob], { type: "application/pdf" }),
      );
      if (preview && !preview.closed) {
        preview.opener = null;
        preview.location.replace(url);
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch (e) {
      preview?.close();
      notify(e instanceof Error ? e.message : "Nepavyko paruošti PDF.", true);
    } finally {
      setBusy(false);
    }
  }
  const options = trip
    ? [
        {
          kind: "route" as const,
          label: "Maršruto lapas",
          detail: "Sustojimai ir atvykimo būsenos",
          icon: Route,
        },
        {
          kind: "passengers" as const,
          label: "Keleivių sąrašas",
          detail: "Kontaktai, adresai ir bagažas",
          icon: Users,
        },
        {
          kind: "parcels" as const,
          label: "Siuntų sąrašas",
          detail: "Gavėjai, adresai ir svoris",
          icon: Package,
        },
        {
          kind: "trip" as const,
          label: "Reiso lapas",
          detail: "Maršrutas, keleiviai ir siuntos",
          icon: FileText,
        },
      ]
    : [
        {
          kind: "finance" as const,
          label: "Finansų suvestinė",
          detail: "Pasirinktas laikotarpis",
          icon: FileText,
        },
      ];
  return (
    <div
      className="pdf-menu"
      ref={container}
      onKeyDown={(e) => {
        if (!open) return;
        const buttons = Array.from(
          container.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]',
          ) ?? [],
        );
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          buttons[
            (current + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
          ]?.focus();
        }
        if (e.key === "Escape") {
          setOpen(false);
          container.current?.querySelector("button")?.focus();
        }
      }}
    >
      <Button
        variant="secondary"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((s) => !s)}
      >
        <Printer size={16} />
        {busy ? "Ruošiama..." : "Spausdinti / PDF"}
        <ChevronDown size={14} />
      </Button>
      {open && (
        <div className="pdf-options" role="menu" aria-label="PDF dokumentai">
          {options.map(({ kind, label, detail, icon: Icon }) => (
            <button role="menuitem" key={kind} onClick={() => generate(kind)}>
              <Icon size={17} />
              <span>
                <b>{label}</b>
                <small>{detail}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
