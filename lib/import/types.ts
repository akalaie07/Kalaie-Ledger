// =============================================================================
// Normalized Import Model — Kalaie Ledger
//
// Alle Platform-Exporte (Copecart, Ablefy, Digistore) und das Legacy-XLSX
// werden zuerst in dieses Modell umgewandelt, bevor irgendwas in die DB
// geschrieben wird.
// =============================================================================

export type ImportSource = "copecart" | "ablefy" | "digistore" | "legacy_xlsx";

export type NormalizedEventType =
  | "payment_paid"
  | "payment_pending"
  | "payment_failed"
  | "refund"
  | "chargeback"
  | "chargeback_reversal"
  | "unknown";

export type NormalizedPlanType =
  | "one_time"
  | "installments"
  | "subscription"
  | "unknown";

export type NormalizedImportRow = {
  source: ImportSource;
  rowNumber: number;
  externalOrderId: string;
  externalTransactionId: string | null;
  externalInstallmentId: string | null;
  /** Platform + Felder aus der Quelldatei — eindeutig pro Transaktion */
  syntheticKey: string;
  customerName: string;
  customerEmail: string | null;
  productRawName: string | null;
  platformRawName: string | null;
  planType: NormalizedPlanType;
  eventType: NormalizedEventType;
  amount: number;
  currency: string;
  /** ISO-Date: YYYY-MM-DD */
  eventDate: string;
  /** ISO-Date oder null */
  dueDate: string | null;
  installmentSequence: number | null;
  /** Alle Original-Spalten als Key-Value Map */
  rawData: Record<string, string>;
  warnings: string[];
};

// =============================================================================
// Preview-Klassifikation
// =============================================================================

export type PreviewClassification = "safe" | "warning" | "conflict" | "error";

export type PreviewAction =
  | "create_deal"
  | "mark_paid_one_time"
  | "mark_paid_installment"
  | "create_installment_and_mark_paid"
  | "mark_refunded"
  | "mark_failed"
  | "mark_chargeback"
  | "mark_chargeback_reversal"
  | "skip_already_paid"
  | "skip_no_match"
  | "needs_review"
  | "bootstrap_deal"
  | "error";

export type FuzzyMatch = {
  dealId: string;
  dealCustomerName: string;
  /** 0.0 – 1.0 */
  score: number;
  reasons: string[];
};

export type PreviewItem = {
  rowNumber: number;
  syntheticKey: string;
  classification: PreviewClassification;
  action: PreviewAction;
  /** Lesbarer Aktions-Text für die UI */
  actionLabel: string;
  /** 0.0 – 1.0 */
  confidence: number;
  reason: string;
  /** Aktueller Zustand in der DB (null = kein Deal gefunden) */
  oldValues: Record<string, unknown> | null;
  /** Was geschrieben würde */
  newValues: Record<string, unknown>;
  warnings: string[];
  conflicts: string[];
  /** Fuzzy-Kandidaten für Items ohne Bestell-ID-Match */
  suggestedDeals: FuzzyMatch[];
  normalized: NormalizedImportRow;
};
