import { draftOrder } from '../../domain/record-mode.ts';
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CellInput, RowInput } from "jspdf-autotable";
import type { Database, Order, Trip } from "../../domain/models.ts";
import { tripStatuses, orderStatuses } from "../../domain/models.ts";
import {
  money,
  totals,
  tripOrders,
  hasAgreedPrice,
} from "../../domain/logic.ts";
import { routeVisits } from "../../domain/route-plan.ts";

import {drawPrintMap,type PrintBasemap} from "./basemap.ts";
import type { RoadRoute } from "../maps";
export interface PrintOptions {mode?:"monochrome"|"color";route?:RoadRoute;basemap?:PrintBasemap}
const documentOptions=new WeakMap<jsPDF,PrintOptions>();
export type FinanceDocument="finance"|"expenses"|"payments";

export type TripDocument = "route" | "passengers" | "parcels" | "trip";
export interface DocumentFonts {
  regular: string;
  bold: string;
}
const ink: [number, number, number] = [39, 39, 39];
const muted: [number, number, number] = [110, 110, 110];
const accent: [number, number, number] = [24, 94, 146];
const margin = 17;
const pageWidth = 210;

function setup(
  fonts: DocumentFonts,
  title: string,
  company: string,
  reference: string,
  options: PrintOptions = {},
) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  documentOptions.set(doc,options);
  doc.addFileToVFS("Krypta-Regular.ttf", fonts.regular);
  doc.addFont("Krypta-Regular.ttf", "Krypta", "normal");
  doc.addFileToVFS("Krypta-Bold.ttf", fonts.bold);
  doc.addFont("Krypta-Bold.ttf", "Krypta", "bold");
  doc.setProperties({
    title: `${title} · ${reference}`,
    subject: reference,
    creator: "Krypta",
  });
  doc.setFont("Krypta", "normal");
  doc.setTextColor(...muted);
  doc.setFontSize(9);
  doc.text(company, margin, 17);
  doc.setFontSize(9);
  doc.text(reference, pageWidth - margin, 17, { align: "right" });
  doc.setDrawColor(211, 221, 230);
  doc.line(margin, 21, pageWidth - margin, 21);
  doc.setTextColor(...ink);
  doc.setFont("Krypta", "bold");
  doc.setFontSize(19);
  doc.text(title, margin, 33);
  return doc;
}
function table(
  doc: jsPDF,
  head: string[],
  body: RowInput[],
  y: number,
  widths?: Record<number, { cellWidth: number }>,
) {
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, top: 18, bottom: 19 },
    head: [head],
    body: body.length
      ? body
      : [[{ content: "Įrašų nėra", colSpan: head.length } as CellInput]],
    theme: "grid",
    styles: {
      font: "Krypta",
      fontStyle: "normal",
      fontSize: 8,
      cellPadding: 2.6,
      textColor: ink,
      lineColor: [220, 220, 220],
      lineWidth: 0.15,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      font: "Krypta",
      fontStyle: "bold",
      fillColor: documentOptions.get(doc)?.mode === "color" ? [237, 242, 249] : [243, 243, 243],
      textColor: documentOptions.get(doc)?.mode === "color" ? accent : ink,
      fontSize: 7.8,
      cellPadding: 2.3,
    },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    columnStyles: widths,
    showHead: "everyPage",
    rowPageBreak: "avoid",
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;
}
function section(doc: jsPDF, title: string, y: number, reserve = 35) {
  // Reserve space for the section title, table header and first data row.
  if (y + reserve > 275) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("Krypta", "bold");
  doc.setTextColor(...ink);
  doc.setFontSize(11);
  doc.text(title, margin, y + 8);
  return y + 13;
}
function paragraph(doc: jsPDF, text: string, y: number) {
  doc.setFont("Krypta", "normal");
  doc.setTextColor(...muted);
  doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(text, 176) as string[];
  for (const line of lines) {
    if (y > 271) {
      doc.addPage();
      y = 23;
    }
    doc.text(line, margin, y);
    y += 4.5;
  }
  return y;
}
function footer(doc: jsPDF, reference: string) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFont("Krypta", "normal");
      doc.setTextColor(...muted);
      doc.setFontSize(8);
      doc.text("Krypta · " + reference, margin, 10);
      doc.setDrawColor(225, 231, 236);
      doc.line(margin, 13, pageWidth - margin, 13);
    }
    doc.setDrawColor(221, 228, 233);
    doc.line(margin, 280, pageWidth - margin, 280);
    doc.setFont("Krypta", "normal");
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    doc.text(reference, margin, 286);
    doc.text(`${p} / ${total}`, pageWidth - margin, 286, { align: "right" });
  }
  return doc;
}
const datetime = (s: string) => s.replace("T", " ");
function tripMeta(doc: jsPDF, db: Database, t: Trip) {
  const v = db.vehicles.find((v) => v.id === t.vehicleId);
  const d = db.drivers.find((d) => d.id === t.driverId);
  let y = paragraph(doc, t.name, 41);
  y = table(
    doc,
    ["Išvykimas", "Atvykimas", "Būsena"],
    [[datetime(t.departure), datetime(t.arrival), tripStatuses[t.status]]],
    y + 4,
  );
  y = table(
    doc,
    ["Transporto priemonė", "Valstybinis numeris", "Vairuotojas / telefonas"],
    [
      [
        `${v?.make ?? ""} ${v?.model ?? ""}`,
        v?.plate ?? "",
        `${d?.firstName ?? ""} ${d?.lastName ?? ""}\n${d?.phone ?? ""}`,
      ],
    ],
    y + 5,
  );
  return y;
}
function routeTable(doc: jsPDF, t: Trip, y: number) {
  const visits = routeVisits(t.stops);
  return table(
    doc,
    ["Nr.", "Sustojimas / adresas", "Atvykimas", "Būsena"],
    visits.map((v) => [
      v.number,
      `${v.place.name}\n${v.place.address}${v.stops.map((s) => s.note).filter(Boolean).length ? "\n" + [...new Set(v.stops.map((s) => s.note).filter(Boolean))].join("; ") : ""}`,
      v.stops.find((s) => s.arrival)?.arrival?.replace("T", " ") ?? "-",
      v.completed || t.status === "completed" ? "Atvykta" : "Laukiama",
    ]),
    y,
    { 0: { cellWidth: 14 }, 2: { cellWidth: 30 }, 3: { cellWidth: 24 } },
  );
}
function passengerRows(orders: Order[]) {
  return orders
    .filter((o) => o.type === "passenger")
    .map((o) => [
      `${o.name}\n${o.phone}`,
      o.quantity,
      `${o.pickup.name}\n${o.pickup.address}`,
      `${o.delivery.name}\n${o.delivery.address}`,
      o.luggage || "-",
    ]);
}
function parcelRows(orders: Order[]) {
  return orders
    .filter((o) => o.type === "parcel")
    .map((o) => [
      `${o.number}\n${o.name}${o.description ? "\n" + o.description : ""}`,
      `${o.phone || "-"}\n${o.recipient || "-"}\n${o.recipientPhone || "-"}`,
      `${o.pickup.name}\n${o.pickup.address}`,
      `${o.delivery.name}\n${o.delivery.address}`,
      `${o.quantity} vnt.\n${o.weight === null ? "Svoris nežinomas" : o.quantity * o.weight + " kg"}${o.dimensions ? "\n" + o.dimensions : ""}`,
    ]);
}
export function buildTripPdf(
  db: Database,
  t: Trip,
  kind: TripDocument,
  fonts: DocumentFonts,
  options: PrintOptions = {},
) {
  const titles: Record<TripDocument, string> = {
    route: "Maršruto lapas",
    passengers: "Keleivių sąrašas",
    parcels: "Siuntų sąrašas",
    trip: "Reiso lapas",
  };
  const doc = setup(fonts, titles[kind], db.settings.company, t.number, options);
  let y = tripMeta(doc, db, t);
  const orders = tripOrders(db, t.id);
  const unlisted = t.unlisted ?? { passengers: 0, parcels: 0 };
  const summaries = [
    ...(unlisted.passengers > 0 && kind !== 'parcels' ? [`Keleiviai be sąrašo: ${unlisted.passengers}.`] : []),
    ...(unlisted.parcels > 0 && kind !== 'passengers' ? [`Siuntos be sąrašo: ${unlisted.parcels}; svoris nenurodytas.`] : []),
  ];
  if (summaries.length) {
    y = section(doc, 'Kiekiai be sąrašo', y + 3, 24);
    y = paragraph(doc, summaries.join(' ') + ' Vardinėse lentelėse šie kiekiai nekartojami.', y + 3);
  }
  if(options.route&&(kind === "route"||kind === "trip")) y=routeDiagram(doc,t,options.route,y+10,options.basemap);
  if (kind === "route" || kind === "trip") {
    y = section(doc, "Sustojimai", y + 3);
    y = routeTable(doc, t, y);
  }
  if (kind === "passengers" || kind === "trip") {
    y = section(doc, "Keleiviai", y + 3);
    y = table(
      doc,
      ["Keleivis / telefonas", "Kiekis", "Paėmimas", "Pristatymas", "Bagažas"],
      passengerRows(orders),
      y,
      { 1: { cellWidth: 18 } },
    );
  }
  if (kind === "parcels" || kind === "trip") {
    y = section(doc, "Siuntos", y + 3);
    y = table(
      doc,
      [
        "Siunta",
        "Kontaktai / gavėjas",
        "Paėmimas",
        "Pristatymas",
        "Kiekis / svoris",
      ],
      parcelRows(orders),
      y,
    );
  }
  if (t.notes) {
    y = section(doc, "Pastabos", y + 3, 20);
    paragraph(doc, t.notes, y + 3);
  }
  return footer(doc, t.number);
}
export function buildFinancePdf(
 db:Database,from:string,to:string,fonts:DocumentFonts,
 options:PrintOptions={},kind:FinanceDocument='finance',
) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw new Error('Pasirinkite tinkamą laikotarpį.');
 const title=kind==='expenses'?'Išlaidų suvestinė':kind==='payments'?'Gauti mokėjimai':'Finansų suvestinė';
 const doc=setup(fonts,title,db.settings.company,`${from} - ${to}`,options);
 const orders=db.orders.filter(o=>!draftOrder(db,o)&&o.date>=from&&o.date<=to&&o.status!=='cancelled');
 const expenses=db.expenses.filter(e=>e.date>=from&&e.date<=to);
 const f=totals(orders,expenses);
 let y=43;
 if(kind==='expenses') {
  y=table(doc,['Laikotarpio išlaidos','Suma'],[[`${from} - ${to}`,money(f.spent)]],y,{1:{cellWidth:35}});
 } else if(kind==='payments') {
  y=table(doc,['Rodiklis','Suma'],[['Gauti mokėjimai',money(f.paid)]],y,{1:{cellWidth:35}});
  y=section(doc,'Mokėjimai pagal užsakymo datą',y+3);
  table(doc,['Užsakymas / data','Klientas','Gauta'],orders.filter(o=>o.paid>0).map(o=>[`${o.number}\n${o.date}`,db.customers.find(c=>c.id===o.customerId)?.name??o.name,money(o.paid)]),y,{2:{cellWidth:35}});
 } else {
  y=table(doc,['Rodiklis','Suma'],[['Užsakymų vertė',money(f.revenue)],['Gauti mokėjimai',money(f.paid)],['Registruotos išlaidos',money(f.spent)],['Liko mokėti',money(f.balance)],['Preliminarus rezultatas',money(f.result)]],y,{1:{cellWidth:44}});
  y=section(doc,'Užsakymai ir mokėjimai',y+3);
  y=table(doc,['Užsakymas / data','Klientas','Vertė','Sumokėta','Liko mokėti'],orders.map(o=>[`${o.number}\n${o.date}`,db.customers.find(c=>c.id===o.customerId)?.name??o.name,hasAgreedPrice(o)?money(o.price):'-',money(o.paid),hasAgreedPrice(o)?money(o.price-o.paid):'-']),y);
 }
 if(kind!=='payments') {
  y=section(doc,'Išlaidos',y+3);
  table(doc,['Data','Kategorija / aprašymas','Reisas / transportas','Suma'],expenses.map(e=>[e.date,`${e.category}${e.description?'\n'+e.description:''}`,[db.trips.find(t=>t.id===e.tripId)?.number,db.vehicles.find(v=>v.id===e.vehicleId)?.plate].filter(Boolean).join(' / ')||'-',money(e.amount)]),y,{0:{cellWidth:24},2:{cellWidth:35},3:{cellWidth:28}});
 }
 return footer(doc,`${from} - ${to}`);
}

/** Road geometry from OSRM, projected to a bounded print area. No invented routing fallback. */
function routeDiagram(doc:jsPDF,trip:Trip,route:RoadRoute,y:number,basemap?:PrintBasemap) {
 if(!basemap)throw new Error('Žemėlapio pagrindas neįkeltas. Pasirinkite įprastą maršruto lapą arba bandykite dar kartą.');
 if(y+104>270){doc.addPage();y=22;}
 doc.setFont('Krypta','bold');doc.setTextColor(...ink);doc.setFontSize(10);doc.text('Reiso žemėlapis',margin,y);
 const top=y+5,height=82,width=176;
 drawPrintMap(doc,trip,route,basemap,margin,top,width,height,documentOptions.get(doc)?.mode==='color');
 doc.setFont('Krypta','normal');doc.setFontSize(7);doc.setTextColor(...muted);
 doc.text(`${Math.round(route.distance/1000)} km · ${Math.floor(route.duration/3600)} val. ${Math.floor(route.duration%3600/60)} min. važiavimo`,margin,top+height+5);
 doc.text('Natural Earth · © OpenStreetMap · OSRM',pageWidth-margin,top+height+5,{align:'right'});
 return top+height+10;
}
