import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createSeed } from "../src/data/seed.ts";
import { setVisitCompleted } from "../src/domain/route-plan.ts";
import {
  buildTripPdf,
  buildFinancePdf,
} from "../src/services/pdf/documents.ts";
import type { TripDocument } from "../src/services/pdf/documents.ts";
const fonts = {
  regular: readFileSync("public/fonts/DejaVuSans.ttf").toString("base64"),
  bold: readFileSync("public/fonts/DejaVuSans-Bold.ttf").toString("base64"),
};
const db = createSeed("2026-10-22");
const trip = db.trips[0];
trip.stops = setVisitCompleted(trip.stops, 0, true);
mkdirSync("tmp/pdfs", { recursive: true });
for (const kind of [
  "route",
  "passengers",
  "parcels",
  "trip",
] as TripDocument[]) {
  const doc = buildTripPdf(db, trip, kind, fonts);
  writeFileSync(
    `tmp/pdfs/${kind}.pdf`,
    new Uint8Array(doc.output("arraybuffer")),
  );
  console.log(`${kind}: ${doc.getNumberOfPages()} page(s)`);
}
const doc = buildFinancePdf(db, "2000-01-01", "2099-12-31", fonts);
writeFileSync(
  "tmp/pdfs/finance.pdf",
  new Uint8Array(doc.output("arraybuffer")),
);
console.log(`finance: ${doc.getNumberOfPages()} page(s)`);
for(const [name,options,kind] of [
 ["expenses",{mode:"monochrome"},"expenses"],
 ["finance-color",{mode:"color"},"finance"],
] as const) {
 const generated=buildFinancePdf(db,"2026-10-22","2026-10-22",fonts,options,kind);
 writeFileSync(`tmp/pdfs/${name}.pdf`,new Uint8Array(generated.output('arraybuffer')));
 console.log(`${name}: ${generated.getNumberOfPages()} page(s)`);
}
if(existsSync('tmp/road-route.json')) {
 const road=JSON.parse(readFileSync('tmp/road-route.json','utf8'));
 const mapped=buildTripPdf(db,trip,'route',fonts,{mode:'monochrome',route:road,basemap:JSON.parse(readFileSync('public/maps/world.json','utf8'))});
 writeFileSync('tmp/pdfs/route-map.pdf',new Uint8Array(mapped.output('arraybuffer')));
 console.log(`route-map: ${mapped.getNumberOfPages()} page(s)`);
}
// Exercise pagination without writing an additional artifact.
const longDb = structuredClone(db);
longDb.orders = Array.from({ length: 45 }, (_, i) => ({
  ...db.orders[0],
  id: `long-${i}`,
  name: `Keleivis Ąžuolas Žemaitis ${i + 1}`,
}));
const longPdf = buildTripPdf(longDb, trip, "passengers", fonts);
if (longPdf.getNumberOfPages() < 2)
  throw new Error("Expected a multi-page passenger manifest");
console.log(`pagination: ${longPdf.getNumberOfPages()} pages, passed`);
