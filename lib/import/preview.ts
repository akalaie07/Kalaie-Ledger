// =============================================================================
// Preview-Klassifikation — reine Funktion, kein DB-Zugriff
//
// Nimmt normalisierte Import-Rows und den aktuellen DB-Zustand entgegen,
// klassifiziert jede Zeile und gibt PreviewItems zurück.
// =============================================================================

import type {
  NormalizedImportRow,
  PreviewItem,
  PreviewClassification,
  PreviewAction,
  FuzzyMatch,
} from "./types";
import { findFuzzyMatches } from "./fuzzy";

// =============================================================================
// DB-Kontext-Typen (werden vom Server Action befüllt und übergeben)
// =============================================================================

export type InstallmentContext = {
  id: string;
  sequence: number;
  paid: boolean;
  paidAt: string | null;
  amount: number;
  dueDate: string;
};

export type DealContext = {
  id: string;
  orderId: string | null;
  customerName: string;
  totalPrice: number;
  paymentType: "one_time" | "installments";
  productId: string | null;
  productName: string | null;
  platformId: string | null;
  platformName: string | null;
  installments: InstallmentContext[];
  oneTimePayment: { paid: boolean; paidAt: string | null } | null;
};

// =============================================================================
// Public Entry Point
// =============================================================================

/**
 * Klassifiziert alle normalisierten Import-Rows gegen den aktuellen DB-Zustand.
 * Reine Funktion — kein I/O, vollständig testbar.
 *
 * @param allDeals  Alle bekannten Deals der Org — wird für Fuzzy-Matching genutzt
 *                  wenn kein exakter Bestell-ID-Match gefunden wird.
 */
export function classifyRows(
  rows: NormalizedImportRow[],
  dealsByOrderId: Map<string, DealContext>,
  allDeals: DealContext[] = [],
): PreviewItem[] {
  return rows.map((row) => {
    const item = classifyRow(row, dealsByOrderId.get(row.externalOrderId));
    // Fuzzy-Matches nur für Items ohne bestehenden Deal (kein Bestell-ID-Match)
    if (item.oldValues === null && allDeals.length > 0) {
      item.suggestedDeals = findFuzzyMatches(row, allDeals);
    }
    return item;
  });
}

// =============================================================================
// Kern-Klassifikation
// =============================================================================

function classifyRow(
  row: NormalizedImportRow,
  deal: DealContext | undefined,
): PreviewItem {
  const warnings = [...row.warnings];
  const conflicts: string[] = [];

  if (row.source === "legacy_xlsx") {
    return classifyLegacy(row, deal, warnings, conflicts);
  }

  switch (row.eventType) {
    case "payment_paid":
      return classifyPaymentPaid(row, deal, warnings, conflicts);
    case "payment_pending":
      return classifyPaymentPending(row, deal, warnings, conflicts);
    case "payment_failed":
      return classifyPaymentFailed(row, deal, warnings, conflicts);
    case "refund":
      return classifyRefund(row, deal, warnings, conflicts);
    case "chargeback":
      return classifyChargeback(row, deal, warnings, conflicts);
    case "chargeback_reversal":
      return classifyChargebackReversal(row, deal, warnings, conflicts);
    default:
      return make(
        row, "error", "needs_review",
        "Unbekannter Event-Typ — bitte manuell prüfen",
        0.0,
        `Der Event-Typ "${row.eventType}" konnte nicht verarbeitet werden.`,
        null, {}, warnings, conflicts,
      );
  }
}

// =============================================================================
// payment_paid
// =============================================================================

function classifyPaymentPaid(
  row: NormalizedImportRow,
  deal: DealContext | undefined,
  warnings: string[],
  conflicts: string[],
): PreviewItem {
  if (!deal) {
    const confidence = row.customerName !== "Unbekannt" && row.amount > 0 ? 0.70 : 0.45;
    return make(
      row, "warning", "create_deal",
      `Neuen Deal anlegen — "${row.customerName}"`,
      confidence,
      "Keine bestehende Bestellung mit dieser ID — Deal wird neu angelegt.",
      null,
      {
        customerName: row.customerName,
        orderId: row.externalOrderId,
        amount: row.amount,
        planType: row.planType,
        platform: row.platformRawName,
        product: row.productRawName,
        eventDate: row.eventDate,
      },
      warnings, conflicts,
    );
  }

  // ── Einmalzahlung ──────────────────────────────────────────────────────────
  if (deal.paymentType === "one_time") {
    if (deal.oneTimePayment?.paid) {
      conflicts.push(
        `Einmalzahlung für "${deal.customerName}" ist bereits als bezahlt markiert` +
          (deal.oneTimePayment.paidAt ? ` (${deal.oneTimePayment.paidAt.slice(0, 10)})` : "") +
          ".",
      );
      return make(
        row, "conflict", "skip_already_paid",
        "Bereits bezahlt — wird übersprungen",
        1.0,
        "Die Einmalzahlung ist bereits als bezahlt markiert.",
        { paid: true, paidAt: deal.oneTimePayment.paidAt },
        {},
        warnings, conflicts,
      );
    }
    return make(
      row, "safe", "mark_paid_one_time",
      `Einmalzahlung als bezahlt markieren — "${deal.customerName}"`,
      0.95,
      "Einmalzahlung gefunden, noch nicht bezahlt.",
      { paid: false },
      { paid: true, paidAt: row.eventDate },
      warnings, conflicts,
    );
  }

  // ── Ratenzahlung mit bekannter Sequenz ─────────────────────────────────────
  const seq = row.installmentSequence;
  if (seq !== null) {
    const installment = deal.installments.find((i) => i.sequence === seq);

    if (!installment) {
      return make(
        row, "warning", "create_installment_and_mark_paid",
        `Rate ${seq} anlegen & als bezahlt markieren — "${deal.customerName}"`,
        0.80,
        `Rate ${seq} existiert noch nicht im System.`,
        null,
        { sequence: seq, amount: row.amount, paid: true, dueDate: row.eventDate },
        warnings, conflicts,
      );
    }
    if (installment.paid) {
      conflicts.push(
        `Rate ${seq} für "${deal.customerName}" ist bereits bezahlt` +
          (installment.paidAt ? ` (${installment.paidAt.slice(0, 10)})` : "") +
          ".",
      );
      return make(
        row, "conflict", "skip_already_paid",
        `Rate ${seq} bereits bezahlt — wird übersprungen`,
        1.0,
        `Rate ${seq} ist bereits als bezahlt markiert.`,
        { paid: true, paidAt: installment.paidAt, sequence: seq },
        {},
        warnings, conflicts,
      );
    }
    return make(
      row, "safe", "mark_paid_installment",
      `Rate ${seq} als bezahlt markieren — "${deal.customerName}"`,
      0.95,
      `Rate ${seq} gefunden, noch nicht bezahlt.`,
      { paid: false, sequence: seq, amount: installment.amount },
      { paid: true, paidAt: row.eventDate },
      warnings, conflicts,
    );
  }

  // ── Digistore Snapshot ohne Sequenz ────────────────────────────────────────
  if (row.source === "digistore") {
    const unpaid = deal.installments.filter((i) => !i.paid);
    if (unpaid.length === 0 && deal.installments.length > 0) {
      conflicts.push("Alle Raten sind bereits als bezahlt markiert.");
      return make(
        row, "conflict", "skip_already_paid",
        "Alle Raten bereits bezahlt — wird übersprungen",
        1.0,
        "Alle Raten für diesen Deal sind bereits bezahlt.",
        { allPaid: true },
        {},
        warnings, conflicts,
      );
    }
    const isActiveSubscription = row.warnings.some((w) =>
      w.includes("Laufendes Abo/Ratenmodell"),
    );
    const confidence = isActiveSubscription ? 0.55 : 0.78;
    const classification: PreviewClassification = isActiveSubscription ? "warning" : "safe";
    return make(
      row, classification, "mark_paid_installment",
      `${unpaid.length > 0 ? unpaid.length : "alle"} Raten als bezahlt markieren — "${deal.customerName}"`,
      confidence,
      unpaid.length > 0
        ? `${unpaid.length} unbezahlte Rate(n) im Deal gefunden.`
        : "Keine unbezahlten Raten gefunden — Deal hat evtl. noch keine Rate-Einträge.",
      { unpaidCount: unpaid.length },
      { markPaidCount: unpaid.length, paidAt: row.eventDate },
      warnings, conflicts,
    );
  }

  // ── Kein Sequenz-Info (Ablefy Subscription, etc.) ──────────────────────────
  warnings.push(
    "Keine Raten-Sequenz bekannt — Zahlung kann nicht eindeutig einer Rate zugeordnet werden.",
  );
  return make(
    row, "warning", "needs_review",
    `Zahlung prüfen — "${deal.customerName}"`,
    0.45,
    "Raten-Sequenz nicht bekannt — manuelle Zuordnung erforderlich.",
    null,
    { amount: row.amount, eventDate: row.eventDate },
    warnings, conflicts,
  );
}

// =============================================================================
// payment_pending
// =============================================================================

function classifyPaymentPending(
  row: NormalizedImportRow,
  deal: DealContext | undefined,
  warnings: string[],
  conflicts: string[],
): PreviewItem {
  if (!deal) {
    return make(
      row, "warning", "needs_review",
      "Ausstehende Zahlung — kein Deal gefunden",
      0.35,
      "Kein bestehender Deal für diese Bestell-ID.",
      null, {},
      warnings, conflicts,
    );
  }
  warnings.push("Ausstehende Zahlung — kein automatischer Status-Update nötig.");
  return make(
    row, "warning", "needs_review",
    `Ausstehende Zahlung — "${deal.customerName}"`,
    0.65,
    "Zahlung ist ausstehend — kein automatischer Update.",
    null, {},
    warnings, conflicts,
  );
}

// =============================================================================
// payment_failed
// =============================================================================

function classifyPaymentFailed(
  row: NormalizedImportRow,
  deal: DealContext | undefined,
  warnings: string[],
  conflicts: string[],
): PreviewItem {
  const name = deal?.customerName ?? row.customerName;
  return make(
    row, "warning", "mark_failed",
    `Fehlgeschlagene Zahlung markieren — "${name}"`,
    0.85,
    "Zahlung fehlgeschlagen — Deal wird entsprechend markiert.",
    deal ? { customerName: deal.customerName, totalPrice: deal.totalPrice } : null,
    { failed: true, eventDate: row.eventDate },
    warnings, conflicts,
  );
}

// =============================================================================
// refund
// =============================================================================

function classifyRefund(
  row: NormalizedImportRow,
  deal: DealContext | undefined,
  warnings: string[],
  conflicts: string[],
): PreviewItem {
  if (!deal) {
    return make(
      row, "error", "needs_review",
      "Erstattung — kein Deal gefunden",
      0.15,
      "Kein Deal für diese Bestell-ID — Erstattung kann nicht zugeordnet werden.",
      null, {},
      warnings, conflicts,
    );
  }
  return make(
    row, "warning", "mark_refunded",
    `Erstattung markieren — "${deal.customerName}"`,
    0.85,
    "Zahlung soll erstattet werden.",
    { customerName: deal.customerName, totalPrice: deal.totalPrice },
    { refunded: true, amount: row.amount, eventDate: row.eventDate },
    warnings, conflicts,
  );
}

// =============================================================================
// chargeback
// =============================================================================

function classifyChargeback(
  row: NormalizedImportRow,
  deal: DealContext | undefined,
  warnings: string[],
  conflicts: string[],
): PreviewItem {
  conflicts.push("Rückbuchung — immer manuelle Prüfung und Nachverfolgung erforderlich.");
  const name = deal?.customerName ?? row.customerName;
  return make(
    row, "conflict", "mark_chargeback",
    `Rückbuchung — "${name}"`,
    0.70,
    "Rückbuchung erkannt — manuelle Prüfung erforderlich.",
    deal ? { customerName: deal.customerName } : null,
    { chargeback: true, amount: row.amount },
    warnings, conflicts,
  );
}

// =============================================================================
// chargeback_reversal
// =============================================================================

function classifyChargebackReversal(
  row: NormalizedImportRow,
  deal: DealContext | undefined,
  warnings: string[],
  conflicts: string[],
): PreviewItem {
  conflicts.push("Stornierung einer Rückbuchung — manuelle Prüfung erforderlich.");
  const name = deal?.customerName ?? row.customerName;
  return make(
    row, "conflict", "mark_chargeback_reversal",
    `Rückbuchung-Stornierung — "${name}"`,
    0.60,
    "Stornierung einer Rückbuchung — manuelle Prüfung erforderlich.",
    deal ? { customerName: deal.customerName } : null,
    { chargebackReversal: true },
    warnings, conflicts,
  );
}

// =============================================================================
// Legacy XLSX (Bootstrap/Migration)
// =============================================================================

function classifyLegacy(
  row: NormalizedImportRow,
  deal: DealContext | undefined,
  warnings: string[],
  conflicts: string[],
): PreviewItem {
  if (deal) {
    // Deal hat Plattformdaten → Legacy darf nichts überschreiben
    if (deal.platformId) {
      conflicts.push(
        `Deal existiert bereits von Plattform "${deal.platformName ?? "unbekannt"}" — ` +
          `Legacy-Import überschreibt keine Plattformdaten.`,
      );
      return make(
        row, "conflict", "skip_no_match",
        "Legacy übersprungen — Plattformdaten vorhanden",
        0.0,
        `Deal mit Plattform "${deal.platformName}" existiert bereits.`,
        { customerName: deal.customerName, platform: deal.platformName },
        {},
        warnings, conflicts,
      );
    }

    // Deal ohne Plattformdaten → Bootstrap möglich
    const seq = row.installmentSequence;
    if (seq !== null) {
      const inst = deal.installments.find((i) => i.sequence === seq);
      if (inst?.paid) {
        conflicts.push(`Rate ${seq} ist bereits als bezahlt markiert.`);
        return make(
          row, "conflict", "skip_already_paid",
          `Rate ${seq} bereits bezahlt — übersprungen`,
          1.0, "Rate ist bereits bezahlt.",
          { paid: true }, {},
          warnings, conflicts,
        );
      }
      return make(
        row, "warning", "bootstrap_deal",
        `Bootstrap: Rate ${seq} als bezahlt markieren — "${deal.customerName}"`,
        0.68,
        "Bestehender Deal ohne Plattformdaten — Bootstrap-Import.",
        { paid: false, sequence: seq },
        { paid: true, paidAt: row.eventDate },
        warnings, conflicts,
      );
    }
    return make(
      row, "warning", "bootstrap_deal",
      `Bootstrap: Zahlung markieren — "${deal.customerName}"`,
      0.65,
      "Bestehender Deal ohne Plattformdaten — Bootstrap-Import.",
      deal.oneTimePayment ? { paid: deal.oneTimePayment.paid } : null,
      deal.oneTimePayment?.paid ? {} : { paid: true },
      warnings, conflicts,
    );
  }

  // Kein Deal → neuen Bootstrap-Deal anlegen
  return make(
    row, "warning", "bootstrap_deal",
    `Bootstrap: Neuen Deal anlegen — "${row.customerName}"`,
    0.60,
    "Kein bestehender Deal — wird als Bootstrap-Import angelegt.",
    null,
    {
      customerName: row.customerName,
      orderId: row.externalOrderId,
      amount: row.amount,
      planType: row.planType,
    },
    warnings, conflicts,
  );
}

// =============================================================================
// Konstruktor-Helfer
// =============================================================================

const ACTION_LABELS: Record<PreviewAction, string> = {
  create_deal: "Neuen Deal anlegen",
  mark_paid_one_time: "Einmalzahlung als bezahlt markieren",
  mark_paid_installment: "Rate als bezahlt markieren",
  create_installment_and_mark_paid: "Rate anlegen & bezahlt markieren",
  mark_refunded: "Als erstattet markieren",
  mark_failed: "Als fehlgeschlagen markieren",
  mark_chargeback: "Rückbuchung markieren",
  mark_chargeback_reversal: "Rückbuchung-Stornierung markieren",
  skip_already_paid: "Übersprungen (bereits bezahlt)",
  skip_no_match: "Übersprungen (kein Match)",
  needs_review: "Manuelle Prüfung erforderlich",
  bootstrap_deal: "Bootstrap-Import",
  error: "Fehler",
};

function make(
  row: NormalizedImportRow,
  classification: PreviewClassification,
  action: PreviewAction,
  actionLabel: string,
  confidence: number,
  reason: string,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown>,
  warnings: string[],
  conflicts: string[],
): PreviewItem {
  return {
    rowNumber: row.rowNumber,
    syntheticKey: row.syntheticKey,
    classification,
    action,
    actionLabel: actionLabel || ACTION_LABELS[action],
    confidence,
    reason,
    oldValues,
    newValues,
    warnings,
    conflicts,
    suggestedDeals: [],
    normalized: row,
  };
}
