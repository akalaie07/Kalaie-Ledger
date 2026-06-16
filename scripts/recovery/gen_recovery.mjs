import { readFileSync, writeFileSync } from "fs";

function parseLine(line, delim) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === delim && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
function load(path, delim) {
  const txt = readFileSync(path, "utf8").replace(/^﻿/, "");
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  const headers = parseLine(lines[0], delim);
  return { headers, rows: lines.slice(1).map((l) => parseLine(l, delim)) };
}
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function colIdx(headers, ...names) {
  for (const n of names) {
    const i = headers.findIndex((h) => norm(h) === norm(n) || norm(h).includes(norm(n)));
    if (i >= 0) return i;
  }
  return -1;
}
const D = "C:/Users/sfaka/Downloads/";

// Stammdaten-Produkt-IDs
const P = {
  gold: "fb8bb6ec-ada3-4d9a-8c4f-974512bd9b4f",   // MSM Gold
  silber: "2eaff5cc-2201-45de-8154-bc6e19826a6a", // MSM Silber
  bronze: "ab93a1f0-3b1c-4029-8f52-8342179f58d0", // MSM Bronze
};

// Produkt-Name (CSV) -> product_id. Nur eindeutige Faelle. null = bewusst offen lassen.
function mapProduct(raw) {
  const n = norm(raw);
  if (n.includes("gold")) return P.gold;
  if (n.includes("silber")) return P.silber;
  if (n.includes("bronze")) return P.bronze;
  return null; // MCC, Community, Live Calls, "Masterclass" ohne Stufe -> offen
}

const orderToProduct = new Map(); // order_id -> product_id
const unmapped = {};              // unmapped raw name -> count

function ingest(file, delim, idCol, prodCol) {
  const { headers, rows } = load(D + file, delim);
  const iId = colIdx(headers, idCol);
  const iProd = colIdx(headers, prodCol);
  for (const r of rows) {
    const id = r[iId]; const raw = r[iProd];
    if (!id) continue;
    const pid = mapProduct(raw);
    if (pid) orderToProduct.set(id, pid);
    else unmapped[raw || "(leer)"] = (unmapped[raw || "(leer)"] || 0) + 1;
  }
}

ingest("export-digistore-komplett.csv", ";", "bestell-id", "produktname");
ingest("Transaktionen-Copecart-komplett.csv", ",", "bestell-id", "produktname");
ingest("Ablefy-komplett.csv", ";", "bestell-id", "produktname");

// ---- Validierung gegen die 25 Beispiel-Deals ----
const sample = ["eVAJcnqX","2mU7nbr9","jny6DJ79","-4fefWGA","s0nC029X","hhK5Xdkt","81Mk_F7w","qUaVBoRI","ODgZuYcV","-OMfvxPY","VcTIykbQ","gZmCXmdO","rBLoYlQH","O9F1tuNb","BYKr1a2s","Yoa0hEPS","CCVEc054","pJTJVu4H","f3z5dYdh","_i9C3kzx","QeBeyaai","sbaz5uq9","i1QIVqRL","n-Frgp4k","GGp4cnIn"];
const found = sample.filter((s) => orderToProduct.has(s));
const nameById = { [P.gold]: "MSM Gold", [P.silber]: "MSM Silber", [P.bronze]: "MSM Bronze" };

console.log(`Zuordenbare Bestell-IDs gesamt: ${orderToProduct.size}`);
const byProd = {};
for (const pid of orderToProduct.values()) byProd[nameById[pid]] = (byProd[nameById[pid]] || 0) + 1;
console.log("  davon:", JSON.stringify(byProd));
console.log(`\nValidierung 25 Beispiel-Deals: ${found.length}/25 in den CSVs gefunden`);
for (const s of sample) console.log(`  ${found.includes(s) ? "OK " : "-- "} ${s}` + (orderToProduct.has(s) ? ` -> ${nameById[orderToProduct.get(s)]}` : ""));
console.log("\nNICHT zugeordnet (mehrdeutig / kein Stammdaten-Produkt):");
Object.entries(unmapped).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)} x ${k}`));

// ---- SQL erzeugen ----
const values = [...orderToProduct.entries()].map(([oid, pid]) => `  (${sqlStr(oid)}, '${pid}')`).join(",\n");
function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
const sql = `-- Produkt-Wiederherstellung (nur leere product_id, gematcht ueber Bestell-ID)\n` +
`-- Erzeugt aus Digistore/Copecart/Ablefy-Exporten. Fuellt NUR Deals deren product_id aktuell NULL ist.\n` +
`with m(order_id, product_id) as (\n  values\n${values}\n)\n` +
`update deals d\n` +
`set product_id = m.product_id::uuid, updated_at = now()\n` +
`from m\n` +
`where d.order_id = m.order_id\n` +
`  and d.product_id is null\n` +
`  and d.organization_id = (select organization_id from deals group by 1 order by count(*) desc limit 1)\n` +
`returning d.order_id, d.customer_name, m.product_id;\n`;
writeFileSync(D + "recovery_products.sql", sql, "utf8");
console.log(`\nSQL geschrieben: ${D}recovery_products.sql (${orderToProduct.size} Mappings)`);
