import { readFileSync } from "fs";

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

function analyze(name, file, delim, idCol, prodCol, nutzerCol) {
  const { headers, rows } = load(D + file, delim);
  const iId = colIdx(headers, idCol);
  const iProd = colIdx(headers, prodCol);
  const iNutzer = nutzerCol ? colIdx(headers, nutzerCol) : -1;
  const prodCount = {}; const nutzerCount = {}; const ids = new Set();
  for (const r of rows) {
    const id = r[iId]; if (id) ids.add(id);
    const p = r[iProd] || "(leer)"; prodCount[p] = (prodCount[p] || 0) + 1;
    if (iNutzer >= 0) { const n = r[iNutzer] || "(leer)"; nutzerCount[n] = (nutzerCount[n] || 0) + 1; }
  }
  console.log(`\n===== ${name} (${rows.length} Zeilen, ${ids.size} eindeutige Bestell-IDs) =====`);
  console.log(`  ID-Spalte: "${headers[iId]}" [${iId}] | Produkt: "${headers[iProd]}" [${iProd}]` + (iNutzer >= 0 ? ` | Nutzer: "${headers[iNutzer]}" [${iNutzer}]` : ""));
  console.log("  Produkte:");
  Object.entries(prodCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${String(v).padStart(4)} x ${k}`));
  if (iNutzer >= 0) {
    console.log("  Nutzer/Closer:");
    Object.entries(nutzerCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${String(v).padStart(4)} x ${k}`));
  }
}

analyze("DIGISTORE", "export-digistore-komplett.csv", ";", "bestell-id", "produktname");
analyze("COPECART", "Transaktionen-Copecart-komplett.csv", ",", "bestell-id", "produktname");
analyze("ABLEFY", "Ablefy-komplett.csv", ";", "bestell-id", "produktname", "nutzer");
