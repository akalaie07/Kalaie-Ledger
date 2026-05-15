"use client";

import { useRef, useState, useTransition, useEffect, useActionState } from "react";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  Eye,
  PlusCircle,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

import { previewImport } from "@/lib/actions/import-preview";
import { executeImport } from "@/lib/actions/import-execute";
import type { ExecuteResult } from "@/lib/actions/import-execute";
import { getImportFormOptions } from "@/lib/actions/import-form-options";
import type { ImportFormOptions } from "@/lib/actions/import-form-options";
import { createDealFromImport } from "@/lib/actions/create-deal-from-import";
import type { CreateFromImportResult } from "@/lib/actions/create-deal-from-import";
import {
  parseCopecartExport,
  parseAblefyExport,
  parseDigistoreExport,
} from "@/lib/import";
import type {
  NormalizedImportRow,
  PreviewItem,
  PreviewClassification,
  PreviewAction,
} from "@/lib/import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// =============================================================================
// Plattform-Konfiguration
// =============================================================================

export type SupportedPlatform = "copecart" | "digistore" | "ablefy";

type PlatformConfig = {
  name: string;
  color: string;
  description: string;
  note?: string;
  parse: (text: string) => NormalizedImportRow[];
  validateHeaders: (firstLine: string) => boolean;
};

const PLATFORM_CONFIG: Record<SupportedPlatform, PlatformConfig> = {
  copecart: {
    name: "Copecart",
    color: "bg-purple-500/15 text-purple-400",
    description: "Lade hier deinen Copecart-Transaktionsexport hoch.",
    parse: parseCopecartExport,
    validateHeaders: (firstLine) => {
      const h = firstLine.toLowerCase();
      return h.includes("kundenname") || h.includes("transaktions");
    },
  },
  digistore: {
    name: "Digistore",
    color: "bg-amber-500/15 text-amber-400",
    description: "Lade hier deinen Digistore-Bestell-/Zahlungsexport hoch.",
    note: "Digistore-Dateien sind oft Snapshot-Exporte und können manuelle Prüfung benötigen.",
    parse: parseDigistoreExport,
    validateHeaders: (firstLine) => {
      const h = firstLine.toLowerCase();
      return h.includes("zahlungsstatus") || h.includes("bestellnummer");
    },
  },
  ablefy: {
    name: "Ablefy",
    color: "bg-cyan-500/15 text-cyan-400",
    description: "Lade hier deinen Ablefy-Zahlungsexport hoch.",
    parse: parseAblefyExport,
    validateHeaders: (firstLine) => {
      const h = firstLine.toLowerCase();
      return h.includes("trx-id") || h.includes("fälligkeiten") || h.includes("faelligkeiten");
    },
  },
};

// =============================================================================
// Client-State pro Preview-Item
// =============================================================================

type ItemStatus = "ready" | "pending_review" | "skipped";

type ItemDecision = {
  status: ItemStatus;
  overrideAction?: PreviewAction;
};

// =============================================================================
// Gruppen-Klassifikation
// =============================================================================

const MANUAL_ACTIONS = new Set([
  "needs_review",
  "mark_failed",
  "mark_chargeback",
  "mark_chargeback_reversal",
  "mark_refunded",
]);
const SKIP_ACTIONS = new Set(["skip_already_paid", "skip_no_match"]);

type GroupKey = "autoImport" | "needsDecision" | "skipped" | "error";

function classifyItem(item: PreviewItem): GroupKey {
  if (item.classification === "error") return "error";
  if (SKIP_ACTIONS.has(item.action)) return "skipped";
  if (item.classification === "conflict" || MANUAL_ACTIONS.has(item.action)) return "needsDecision";
  return "autoImport";
}

function buildInitialDecisions(items: PreviewItem[]): Map<string, ItemDecision> {
  const map = new Map<string, ItemDecision>();
  for (const item of items) {
    const group = classifyItem(item);
    if (group === "autoImport") map.set(item.syntheticKey, { status: "ready" });
    else if (group === "needsDecision") map.set(item.syntheticKey, { status: "pending_review" });
    else map.set(item.syntheticKey, { status: "skipped" });
  }
  return map;
}

// =============================================================================
// UI-Helfer
// =============================================================================

const EVENT_BADGE: Record<string, string> = {
  payment_paid: "bg-emerald-500/15 text-emerald-400",
  payment_pending: "bg-muted text-muted-foreground",
  payment_failed: "bg-rose-500/15 text-rose-400",
  refund: "bg-amber-500/15 text-amber-400",
  chargeback: "bg-orange-500/15 text-orange-400",
  chargeback_reversal: "bg-blue-500/15 text-blue-400",
};
const EVENT_LABEL: Record<string, string> = {
  payment_paid: "Bezahlt",
  payment_pending: "Ausstehend",
  payment_failed: "Fehlgeschlagen",
  refund: "Erstattung",
  chargeback: "Rückbuchung",
  chargeback_reversal: "RB-Storno",
};
const CLASS_COLOR: Record<PreviewClassification, string> = {
  safe: "border-l-emerald-500 bg-emerald-500/5",
  warning: "border-l-amber-500 bg-amber-500/5",
  conflict: "border-l-orange-500 bg-orange-500/5",
  error: "border-l-red-500 bg-red-500/5",
};
const CLASS_BADGE: Record<PreviewClassification, string> = {
  safe: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  conflict: "bg-orange-500/15 text-orange-400",
  error: "bg-red-500/15 text-red-400",
};
const CLASS_LABEL: Record<PreviewClassification, string> = {
  safe: "Sicher",
  warning: "Hinweis",
  conflict: "Konflikt",
  error: "Fehler",
};

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-0.5">{msg}</p>;
}

// =============================================================================
// ManualDealForm — vollständiges Deal-Formular für die Abarbeiten-Queue
// =============================================================================

function ManualDealForm({
  item,
  formOptions,
  queueIndex,
  totalCount,
  onCreated,
  onSkip,
}: {
  item: PreviewItem;
  formOptions: ImportFormOptions;
  queueIndex: number;
  totalCount: number;
  onCreated: (key: string, dealId: string) => void;
  onSkip: () => void;
}) {
  const n = item.normalized;
  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: n.currency || "EUR" });

  const defaultPaymentType: "one_time" | "installments" =
    n.planType === "installments" || n.planType === "subscription" ? "installments" : "one_time";

  const [state, formAction, pending] = useActionState<CreateFromImportResult | null, FormData>(
    createDealFromImport,
    null,
  );

  const [paymentType, setPaymentType] = useState<"one_time" | "installments">(defaultPaymentType);
  const [hasAnzahlung, setHasAnzahlung] = useState(false);
  const [totalPrice, setTotalPrice] = useState(n.amount || 0);
  const [downPayment, setDownPayment] = useState(0);
  const [numberOfRates, setNumberOfRates] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedProductType, setSelectedProductType] = useState<
    "standard" | "subscription_monthly" | "subscription_yearly"
  >("standard");

  const isSubscription =
    selectedProductType === "subscription_monthly" || selectedProductType === "subscription_yearly";

  const ratenLabel =
    selectedProductType === "subscription_monthly"
      ? "Laufzeit (Monate)"
      : selectedProductType === "subscription_yearly"
      ? "Laufzeit (Jahre)"
      : "Anzahl Raten";

  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    const product = formOptions.products.find((p) => p.id === productId);
    const type = product?.product_type ?? "standard";
    setSelectedProductType(type);
    if (type === "subscription_monthly" || type === "subscription_yearly") {
      setPaymentType("installments");
    }
  }

  // Wenn createDealFromImport erfolgreich → onCreated aufrufen
  useEffect(() => {
    if (state && "dealId" in state) {
      onCreated(item.syntheticKey, state.dealId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fe = (state && "fieldErrors" in state ? state.fieldErrors : {}) ?? {};
  const formError = state && "error" in state && !("dealId" in state) ? state.error : null;

  function fmtPreview(v: number) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
  }

  return (
    <div className="space-y-4">
      {/* Fortschritt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Eintrag {queueIndex + 1} von {totalCount}</span>
          <span className="text-muted-foreground">{totalCount - queueIndex - 1} verbleibend</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-1.5 bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${(queueIndex / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Import-Kontext */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Aus Import</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">Kunde: </span>
            <span className="font-medium">{n.customerName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Betrag: </span>
            <span className="font-medium">{n.amount > 0 ? fmt.format(n.amount) : "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Datum: </span>
            <span className="font-medium">{n.eventDate}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Bestell-ID: </span>
            <span className="font-mono text-[11px]">{n.externalOrderId}</span>
          </div>
          {n.productRawName && (
            <div>
              <span className="text-muted-foreground">Produkt: </span>
              <span>{n.productRawName}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Event: </span>
            <span>{EVENT_LABEL[n.eventType] ?? n.eventType}</span>
          </div>
        </div>
        {item.reason && (
          <p className="text-[11px] text-amber-400/70">{item.reason}</p>
        )}
      </div>

      {/* Deal-Formular */}
      <div className="rounded-lg border border-border bg-card p-5">
        <form action={formAction} className="space-y-6">
          {formError && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}

          {/* Kerndaten */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Kerndaten
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`cn-${item.syntheticKey}`}>
                  Kunde <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`cn-${item.syntheticKey}`}
                  name="customer_name"
                  required
                  defaultValue={n.customerName !== "Unbekannt" ? n.customerName : ""}
                  aria-invalid={!!fe.customer_name}
                />
                <FieldError msg={fe.customer_name?.[0]} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`oid-${item.syntheticKey}`}>Bestell-ID</Label>
                <Input
                  id={`oid-${item.syntheticKey}`}
                  name="order_id"
                  defaultValue={n.externalOrderId}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`prod-${item.syntheticKey}`}>Produkt</Label>
                <select
                  id={`prod-${item.syntheticKey}`}
                  name="product_id"
                  value={selectedProductId}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  )}
                >
                  <option value="">— keine —</option>
                  {formOptions.products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`plat-${item.syntheticKey}`}>Plattform</Label>
                <select
                  id={`plat-${item.syntheticKey}`}
                  name="platform_id"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— keine —</option>
                  {formOptions.platforms.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`pm-${item.syntheticKey}`}>Zahlart</Label>
              <Input
                id={`pm-${item.syntheticKey}`}
                name="payment_method"
                placeholder="z.B. Überweisung, Kreditkarte, PayPal"
              />
            </div>
          </section>

          {/* Preise & Zahlung */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Preise & Zahlung
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`tp-${item.syntheticKey}`}>
                  Gesamtpreis (€) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`tp-${item.syntheticKey}`}
                  name="total_price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(parseFloat(e.target.value) || 0)}
                  aria-invalid={!!fe.total_price}
                />
                <FieldError msg={fe.total_price?.[0]} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cd-${item.syntheticKey}`}>
                  Abschlussdatum <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`cd-${item.syntheticKey}`}
                  name="close_date"
                  type="date"
                  required
                  defaultValue={n.eventDate}
                  aria-invalid={!!fe.close_date}
                />
                <FieldError msg={fe.close_date?.[0]} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`pt-${item.syntheticKey}`}>
                  Zahlungsart <span className="text-destructive">*</span>
                </Label>
                {isSubscription ? (
                  <>
                    <input type="hidden" name="payment_type" value="installments" />
                    <div className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-300">
                      Abo — Ratenzahlung
                    </div>
                  </>
                ) : (
                  <select
                    id={`pt-${item.syntheticKey}`}
                    name="payment_type"
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as "one_time" | "installments")}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="one_time">Einmalzahlung</option>
                    <option value="installments">Ratenzahlung</option>
                  </select>
                )}
              </div>
            </div>

            {/* Anzahlung */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasAnzahlung}
                  onChange={(e) => setHasAnzahlung(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                Anzahlung geleistet
              </label>
              {hasAnzahlung && (
                <div className="space-y-1.5">
                  <Label htmlFor={`dp-${item.syntheticKey}`}>
                    Höhe der Anzahlung (€) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`dp-${item.syntheticKey}`}
                    name="down_payment"
                    type="number"
                    min="0"
                    step="0.01"
                    value={downPayment || ""}
                    onChange={(e) => setDownPayment(parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
            </div>

            {paymentType === "one_time" && (
              <div className="space-y-1.5">
                <Label htmlFor={`otp-${item.syntheticKey}`}>Zahlung fällig zum</Label>
                <Input
                  id={`otp-${item.syntheticKey}`}
                  name="one_time_due_date"
                  type="date"
                  defaultValue={n.dueDate ?? ""}
                />
              </div>
            )}

            {paymentType === "installments" && (
              <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`nr-${item.syntheticKey}`}>{ratenLabel}</Label>
                    <Input
                      id={`nr-${item.syntheticKey}`}
                      name="number_of_rates"
                      type="number"
                      min={isSubscription ? "1" : "2"}
                      value={numberOfRates || ""}
                      onChange={(e) => setNumberOfRates(parseInt(e.target.value) || 0)}
                      aria-invalid={!!fe.number_of_rates}
                      placeholder="z.B. 3"
                    />
                    <FieldError msg={fe.number_of_rates?.[0]} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`fdd-${item.syntheticKey}`}>Erstes Fälligkeitsdatum</Label>
                    <Input
                      id={`fdd-${item.syntheticKey}`}
                      name="first_due_date"
                      type="date"
                      defaultValue={n.dueDate ?? n.eventDate}
                    />
                  </div>
                </div>
                {totalPrice > 0 && numberOfRates >= 2 && (
                  (() => {
                    const dp = hasAnzahlung ? downPayment : 0;
                    const base = totalPrice - dp;
                    const perRate = base > 0 ? base / numberOfRates : 0;
                    return (
                      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm">
                        <p className="font-medium text-blue-300 mb-1">Ratenvorschau</p>
                        <p className="text-blue-200/80">
                          {fmtPreview(base)} ÷ {numberOfRates} Raten ={" "}
                          <span className="font-semibold text-blue-100 text-base">{fmtPreview(perRate)}</span>
                        </p>
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </section>

          {/* Team */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Team</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`cl-${item.syntheticKey}`}>Closer</Label>
                <select
                  id={`cl-${item.syntheticKey}`}
                  name="closer_id"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— keine —</option>
                  {formOptions.closers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Status */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</h3>
            <div className="flex flex-wrap gap-5">
              {(
                [
                  { name: "onboarding_done", label: "Onboarding erledigt" },
                  { name: "update_call_done", label: "Update-Call erledigt" },
                  { name: "mahnung_required", label: "Mahnung erforderlich" },
                  { name: "inkasso_required", label: "Inkasso erforderlich" },
                ] as const
              ).map(({ name, label }) => (
                <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    name={name}
                    value="on"
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* Notizen */}
          <div className="space-y-1.5">
            <Label htmlFor={`notes-${item.syntheticKey}`}>Notizen</Label>
            <textarea
              id={`notes-${item.syntheticKey}`}
              name="notes"
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Wird gespeichert…" : "Deal anlegen & Weiter"}
            </Button>
            <Button type="button" variant="outline" onClick={onSkip}>
              Überspringen
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Normale Preview-Row (safe / warning)
// =============================================================================

function PreviewRow({ item }: { item: PreviewItem }) {
  const [exp, setExp] = useState(false);
  const n = item.normalized;
  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: n.currency || "EUR" });
  const hasDetails = item.warnings.length > 0 || item.conflicts.length > 0;

  return (
    <div className={cn("border-l-2 rounded-r-md px-3 py-2 text-xs", CLASS_COLOR[item.classification])}>
      <div className="flex items-start gap-2 flex-wrap">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", CLASS_BADGE[item.classification])}>
          {CLASS_LABEL[item.classification]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{n.customerName}</p>
          <p className="text-muted-foreground font-mono text-[10px]">{n.externalOrderId}</p>
        </div>
        <div className="flex-[2] min-w-0">
          <p className="font-medium">{item.actionLabel}</p>
          <p className="text-muted-foreground">{item.reason}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", EVENT_BADGE[n.eventType] ?? "bg-muted text-muted-foreground")}>
            {EVENT_LABEL[n.eventType] ?? n.eventType}
          </span>
          {n.amount > 0 && (
            <span className="tabular-nums text-muted-foreground">{fmt.format(n.amount)}</span>
          )}
          {/* Bearbeiten-Link wenn ein bestehender Deal bekannt ist */}
          {item.dealId && (
            <Link
              href={`/deals/${item.dealId}/edit`}
              target="_blank"
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border hover:text-foreground hover:border-foreground/30 transition-colors"
              title="Deal bearbeiten"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Bearbeiten
            </Link>
          )}
          {hasDetails && (
            <button onClick={() => setExp((v) => !v)} className="text-muted-foreground hover:text-foreground shrink-0">
              {exp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
      {exp && (
        <div className="mt-2 pl-2 border-l border-border space-y-0.5">
          {item.conflicts.map((c, i) => <p key={i} className="text-orange-400/80 text-[10px]">⚡ {c}</p>)}
          {item.warnings.map((w, i) => <p key={i} className="text-amber-400/80 text-[10px]">⚠ {w}</p>)}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Review-Row (conflict / manual) — bearbeitbar
// =============================================================================

function ReviewItemRow({
  item,
  decision,
  onDecide,
}: {
  item: PreviewItem;
  decision: ItemDecision;
  onDecide: (key: string, d: ItemDecision) => void;
}) {
  const [exp, setExp] = useState(false);
  const n = item.normalized;
  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: n.currency || "EUR" });

  const statusLabel: Record<ItemStatus, string> = {
    ready: "Bereit",
    pending_review: "Offen",
    skipped: "Übersprungen",
  };
  const statusColor: Record<ItemStatus, string> = {
    ready: "bg-emerald-500/15 text-emerald-400",
    pending_review: "bg-amber-500/15 text-amber-400",
    skipped: "bg-muted text-muted-foreground",
  };

  const canCreateNew = item.oldValues === null && n.customerName !== "Unbekannt";

  return (
    <div className={cn(
      "border-l-2 rounded-r-md px-3 py-2 text-xs",
      decision.status === "ready"
        ? "border-l-emerald-500 bg-emerald-500/5"
        : decision.status === "skipped"
        ? "border-l-muted bg-muted/10 opacity-60"
        : "border-l-amber-500 bg-amber-500/5",
    )}>
      <div className="flex items-start gap-2 flex-wrap">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", statusColor[decision.status])}>
          {statusLabel[decision.status]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{n.customerName}</p>
          <p className="text-muted-foreground font-mono text-[10px]">{n.externalOrderId}</p>
        </div>
        <div className="flex-[2] min-w-0">
          <p className="font-medium">{item.actionLabel}</p>
          <p className="text-muted-foreground">{item.reason}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", EVENT_BADGE[n.eventType] ?? "bg-muted text-muted-foreground")}>
            {EVENT_LABEL[n.eventType] ?? n.eventType}
          </span>
          {n.amount > 0 && (
            <span className="tabular-nums text-muted-foreground">{fmt.format(n.amount)}</span>
          )}
          {item.dealId && (
            <Link
              href={`/deals/${item.dealId}/edit`}
              target="_blank"
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Bearbeiten
            </Link>
          )}
          <button onClick={() => setExp((v) => !v)} className="text-muted-foreground hover:text-foreground shrink-0">
            {exp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {exp && (
        <div className="mt-2 space-y-2 pl-2 border-l border-border">
          {(item.conflicts.length > 0 || item.warnings.length > 0) && (
            <div className="space-y-0.5">
              {item.conflicts.map((c, i) => <p key={i} className="text-orange-400/80 text-[10px]">⚡ {c}</p>)}
              {item.warnings.map((w, i) => <p key={i} className="text-amber-400/80 text-[10px]">⚠ {w}</p>)}
            </div>
          )}

          {decision.status !== "skipped" && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {decision.status === "pending_review" && (
                <button
                  onClick={() => onDecide(item.syntheticKey, { status: "ready" })}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                >
                  Trotzdem importieren
                </button>
              )}
              {canCreateNew && decision.status === "pending_review" && (
                <button
                  onClick={() => onDecide(item.syntheticKey, { status: "ready", overrideAction: "create_deal" })}
                  className="rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
                >
                  Als neuen Deal anlegen
                </button>
              )}
              <button
                onClick={() => onDecide(item.syntheticKey, { status: "skipped" })}
                className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                Überspringen
              </button>
            </div>
          )}
          {decision.status === "ready" && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10px] text-emerald-400">
                {decision.overrideAction === "create_deal" ? "Wird als neuer Deal angelegt" : "Wird importiert"}
              </span>
              <button
                onClick={() => onDecide(item.syntheticKey, { status: "pending_review" })}
                className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Rückgängig
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Gruppen-Abschnitt
// =============================================================================

function GroupSection({
  title,
  dotColor,
  items,
  decisions,
  onDecide,
  defaultCollapsed = false,
}: {
  title: string;
  dotColor: string;
  items: PreviewItem[];
  decisions?: Map<string, ItemDecision>;
  onDecide?: (key: string, d: ItemDecision) => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (items.length === 0) return null;
  const isReviewGroup = decisions !== undefined && onDecide !== undefined;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 text-sm font-medium hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className={cn("rounded-full w-2 h-2 shrink-0", dotColor)} />
          {title}
          <span className="text-muted-foreground font-normal">({items.length})</span>
        </span>
        {collapsed
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="p-2 space-y-1.5 max-h-80 overflow-y-auto">
          {items.map((item) =>
            isReviewGroup ? (
              <ReviewItemRow
                key={item.syntheticKey}
                item={item}
                decision={decisions.get(item.syntheticKey) ?? { status: "pending_review" }}
                onDecide={onDecide}
              />
            ) : (
              <PreviewRow key={item.syntheticKey} item={item} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Haupt-Komponente
// =============================================================================

type WizardStep = "upload" | "preview" | "manual_queue" | "done";

export function PlatformImportWizard({ platform }: { platform: SupportedPlatform }) {
  const config = PLATFORM_CONFIG[platform];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [normalized, setNormalized] = useState<NormalizedImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [itemDecisions, setItemDecisions] = useState<Map<string, ItemDecision>>(new Map());
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);

  // Queue-State für manuelles Abarbeiten
  const [manualQueue, setManualQueue] = useState<PreviewItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [formOptions, setFormOptions] = useState<ImportFormOptions | null>(null);

  const [previewPending, startPreviewTransition] = useTransition();
  const [importPending, startImportTransition] = useTransition();
  const [queuePending, startQueueTransition] = useTransition();

  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  // ── Entscheidung pro Item setzen ─────────────────────────────────────────────
  function handleDecide(key: string, decision: ItemDecision) {
    setItemDecisions((prev) => new Map(prev).set(key, decision));
  }

  // ── Zählungen aus itemDecisions ──────────────────────────────────────────────
  const readyCount = Array.from(itemDecisions.values()).filter((d) => d.status === "ready").length;
  const pendingCount = Array.from(itemDecisions.values()).filter((d) => d.status === "pending_review").length;
  const skippedCount = Array.from(itemDecisions.values()).filter((d) => d.status === "skipped").length;
  const errorCount = previewItems.filter((i) => i.classification === "error").length;

  // ── Gruppen für die Review-Section ──────────────────────────────────────────
  const needsDecisionItems = previewItems.filter(
    (i) => i.classification === "conflict" || MANUAL_ACTIONS.has(i.action),
  );
  const autoImportItems = previewItems.filter(
    (i) => (i.classification === "safe" || i.classification === "warning") && !MANUAL_ACTIONS.has(i.action),
  );
  const skippedItems = previewItems.filter((i) => SKIP_ACTIONS.has(i.action));
  const errorItems = previewItems.filter((i) => i.classification === "error");

  // ── Datei verarbeiten ────────────────────────────────────────────────────────
  function handleFile(file: File) {
    setParseError(null);
    setNormalized([]);
    setFileName(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Nur CSV-Dateien werden unterstützt.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target!.result as string;
      const firstLine = text.split("\n")[0] ?? "";

      if (!config.validateHeaders(firstLine)) {
        setParseError(
          `Diese Datei sieht nicht nach einem ${config.name}-Export aus. Bitte den richtigen Export hochladen.`,
        );
        return;
      }

      const rows = config.parse(text);
      if (rows.length === 0) {
        setParseError("Keine Transaktionen in der Datei gefunden. Ist die Datei leer oder im falschen Format?");
        return;
      }

      setFileName(file.name);
      setNormalized(rows);
    };
    reader.readAsText(file, "utf-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ── Vorschau laden ───────────────────────────────────────────────────────────
  function handleLoadPreview() {
    if (normalized.length === 0) return;
    startPreviewTransition(async () => {
      const items = await previewImport(normalized);
      setPreviewItems(items);
      setItemDecisions(buildInitialDecisions(items));
      setStep("preview");
    });
  }

  // ── Import bestätigen ────────────────────────────────────────────────────────
  function handleImport() {
    const toImport = previewItems
      .filter((item) => itemDecisions.get(item.syntheticKey)?.status === "ready")
      .map((item) => {
        const d = itemDecisions.get(item.syntheticKey);
        if (d?.overrideAction) return { ...item, action: d.overrideAction } as PreviewItem;
        return item;
      });

    if (toImport.length === 0) return;

    startImportTransition(async () => {
      const result = await executeImport(toImport, fileName ?? undefined);
      setExecuteResult(result);
      setStep("done");
    });
  }

  // ── Manuelles Abarbeiten starten ─────────────────────────────────────────────
  function handleStartQueue() {
    // Queue = alle Items die noch manuell entschieden werden müssen + Error-Items
    const queue = [
      ...needsDecisionItems.filter((i) => itemDecisions.get(i.syntheticKey)?.status === "pending_review"),
      ...errorItems,
    ];
    if (queue.length === 0) return;

    startQueueTransition(async () => {
      const options = await getImportFormOptions();
      setFormOptions(options);
      setManualQueue(queue);
      setQueueIndex(0);
      setStep("manual_queue");
    });
  }

  // ── Queue: Deal manuell angelegt ─────────────────────────────────────────────
  function handleQueueCreated(key: string, _dealId: string) {
    // Item als "skipped" markieren, damit executeImport es nicht nochmal verarbeitet
    handleDecide(key, { status: "skipped" });
    advanceQueue();
  }

  // ── Queue: Item übersprungen ─────────────────────────────────────────────────
  function handleQueueSkip() {
    advanceQueue();
  }

  function advanceQueue() {
    const nextIndex = queueIndex + 1;
    if (nextIndex >= manualQueue.length) {
      setStep("preview");
    } else {
      setQueueIndex(nextIndex);
    }
  }

  function fullReset() {
    setStep("upload");
    setFileName(null);
    setNormalized([]);
    setParseError(null);
    setPreviewItems([]);
    setItemDecisions(new Map());
    setExecuteResult(null);
    setManualQueue([]);
    setQueueIndex(0);
    setFormOptions(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const paidCount = normalized.filter((r) => r.eventType === "payment_paid").length;
  const refundCount = normalized.filter((r) => r.eventType === "refund").length;
  const failedCount = normalized.filter(
    (r) => r.eventType === "payment_failed" || r.eventType === "chargeback",
  ).length;

  // Anzahl der Items die in der Queue abgearbeitet werden können
  const queueableCount =
    needsDecisionItems.filter((i) => itemDecisions.get(i.syntheticKey)?.status === "pending_review").length +
    errorItems.length;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">

      {/* Plattform-Info */}
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-2">
        <p className="text-sm font-medium">{config.description}</p>
        {config.note && (
          <div className="flex items-start gap-2 text-xs text-blue-400">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p>{config.note}</p>
          </div>
        )}
      </div>

      {/* ── Schritt 1: Upload ─────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "rounded-lg border-2 border-dashed border-border bg-muted/10 px-8 py-10 text-center space-y-3 cursor-pointer transition-colors hover:border-border/80",
              fileName && "py-6",
            )}
          >
            <div className="flex justify-center">
              <div className="rounded-full bg-muted p-3">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <div>
              <p className="font-medium">
                {fileName ? "Andere Datei wählen" : `${config.name}-CSV hochladen`}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Klicken oder Datei hier ablegen
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          {fileName && normalized.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{fileName}</span>
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", config.color)}>
                    {config.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      `${normalized.length} Transaktionen`,
                      `${paidCount} bezahlt`,
                      ...(refundCount > 0 ? [`${refundCount} erstattet`] : []),
                      ...(failedCount > 0 ? [`${failedCount} fehlgeschlagen`] : []),
                    ].join(" · ")}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); fullReset(); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="border-b border-border bg-muted/20 sticky top-0">
                    <tr>
                      {["Bestell-ID", "Kunde", "Betrag", "Event", "Rate", "Warnungen"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {normalized.slice(0, 15).map((r, i) => (
                      <tr key={i} className={cn(r.eventType !== "payment_paid" && "opacity-40")}>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px]">{r.externalOrderId}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{r.customerName}</td>
                        <td className="px-3 py-1.5 tabular-nums">{r.amount > 0 ? fmt.format(r.amount) : "—"}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium", EVENT_BADGE[r.eventType] ?? "bg-muted text-muted-foreground")}>
                            {EVENT_LABEL[r.eventType] ?? r.eventType}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.installmentSequence ? `Rate ${r.installmentSequence}` : "—"}</td>
                        <td className="px-3 py-1.5 text-amber-400/70 text-[10px]">{r.warnings.length > 0 ? `${r.warnings.length} ⚠` : ""}</td>
                      </tr>
                    ))}
                    {normalized.length > 15 && (
                      <tr><td colSpan={6} className="px-3 py-2 text-center text-muted-foreground">+ {normalized.length - 15} weitere…</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {normalized.length > 0 && (
            <div className="flex gap-3">
              <Button onClick={handleLoadPreview} disabled={previewPending}>
                <Eye className="h-4 w-4 mr-1.5" />
                {previewPending ? "Vorschau wird geladen…" : "Vorschau laden"}
              </Button>
              <Button variant="outline" onClick={fullReset}>Abbrechen</Button>
            </div>
          )}
        </div>
      )}

      {/* ── Schritt 2: Preview ────────────────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">
                Vorschau — {previewItems.length} Einträge analysiert
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Noch kein Schreiben in die Datenbank.
              </p>
            </div>
            <button onClick={fullReset} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Zusammenfassung — reagiert auf User-Entscheidungen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">Bereit zum Import</p>
              <p className="text-lg font-semibold text-emerald-400">{readyCount}</p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">Benötigt Entscheidung</p>
              <p className="text-lg font-semibold text-amber-400">{pendingCount}</p>
            </div>
            <div className="rounded-lg border border-muted px-3 py-2">
              <p className="text-xs text-muted-foreground">Übersprungen</p>
              <p className="text-lg font-semibold text-muted-foreground">{skippedCount}</p>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">Fehler</p>
              <p className="text-lg font-semibold text-rose-400">{errorCount}</p>
            </div>
          </div>

          {/* Digistore-Hinweis */}
          {platform === "digistore" && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-400">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>
                Digistore-Exporte sind Order-Snapshots, keine Transaktionslisten.
                Einzelne Raten werden nur markiert wenn der Status eindeutig ist.
              </p>
            </div>
          )}

          {/* Gruppen */}
          <div className="space-y-2">
            <GroupSection
              title="Bereit zum Import"
              dotColor="bg-emerald-500"
              items={autoImportItems}
            />
            <GroupSection
              title="Manuelle Prüfung empfohlen"
              dotColor="bg-amber-500"
              items={needsDecisionItems}
              decisions={itemDecisions}
              onDecide={handleDecide}
            />
            <GroupSection
              title="Wird übersprungen"
              dotColor="bg-muted-foreground"
              items={skippedItems}
              defaultCollapsed
            />
            <GroupSection
              title="Fehler"
              dotColor="bg-rose-500"
              items={errorItems}
              defaultCollapsed
            />
          </div>

          {/* Hinweis wenn noch offene Review-Items vorhanden */}
          {pendingCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>
                Du kannst sichere Einträge jetzt importieren oder die offenen Einträge vorher klären.{" "}
                <span className="font-medium">{pendingCount} {pendingCount === 1 ? "Eintrag benötigt" : "Einträge benötigen"} noch eine Entscheidung.</span>
              </p>
            </div>
          )}

          {/* Aktionen */}
          <div className="flex gap-3 pt-2 flex-wrap items-center">
            <Button
              onClick={handleImport}
              disabled={importPending || readyCount === 0}
            >
              {importPending
                ? "Wird importiert…"
                : pendingCount > 0
                ? `Sichere ${readyCount} importieren`
                : `${readyCount} Einträge importieren`}
            </Button>

            {queueableCount > 0 && (
              <Button
                variant="outline"
                onClick={handleStartQueue}
                disabled={queuePending}
                className="gap-2"
              >
                <ClipboardList className="h-4 w-4" />
                {queuePending
                  ? "Lädt…"
                  : `${queueableCount} manuell abarbeiten`}
              </Button>
            )}

            <Button variant="outline" onClick={() => setStep("upload")}>
              ← Zurück
            </Button>
            {readyCount === 0 && !importPending && queueableCount === 0 && (
              <p className="text-xs text-muted-foreground">Keine importierbaren Einträge.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Schritt 3: Manuelles Abarbeiten ──────────────────────────────── */}
      {step === "manual_queue" && formOptions && manualQueue.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Manuell abarbeiten</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Deals werden direkt angelegt — kein separater Import nötig.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep("preview")}>
              Abbrechen
            </Button>
          </div>

          {queueIndex < manualQueue.length ? (
            <ManualDealForm
              key={manualQueue[queueIndex].syntheticKey}
              item={manualQueue[queueIndex]}
              formOptions={formOptions}
              queueIndex={queueIndex}
              totalCount={manualQueue.length}
              onCreated={handleQueueCreated}
              onSkip={handleQueueSkip}
            />
          ) : (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-6 text-center space-y-3">
              <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-semibold">Alle {manualQueue.length} Einträge abgearbeitet</p>
              <Button onClick={() => setStep("preview")} className="gap-2">
                <ArrowRight className="h-4 w-4" />
                Zurück zur Vorschau
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Schritt 4: Ergebnis ───────────────────────────────────────────── */}
      {step === "done" && executeResult && (
        <div className="space-y-4">
          <div className={cn(
            "rounded-lg border p-4 space-y-3",
            executeResult.errors.length > 0
              ? "border-rose-500/40 bg-rose-500/10"
              : executeResult.reviewNeeded > 0
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-emerald-500/40 bg-emerald-500/10",
          )}>
            <div className="flex items-center gap-2">
              {executeResult.errors.length > 0
                ? <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                : executeResult.reviewNeeded > 0
                ? <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                : <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
              <span className="text-sm font-semibold">
                {config.name}-Import abgeschlossen
              </span>
            </div>

            <p className="text-sm font-medium">
              {(() => {
                const parts: string[] = [];
                if (executeResult.created > 0) parts.push(`${executeResult.created} Deal(s) angelegt`);
                if (executeResult.paid > 0) parts.push(`${executeResult.paid} Zahlung(en) markiert`);
                if (executeResult.installmentsCreated > 0) parts.push(`${executeResult.installmentsCreated} Rate(n) angelegt`);
                if (executeResult.skipped > 0) parts.push(`${executeResult.skipped} übersprungen`);
                if (executeResult.reviewNeeded > 0) parts.push(`${executeResult.reviewNeeded} zur manuellen Prüfung`);
                return parts.length > 0 ? parts.join(" · ") : "Keine Änderungen.";
              })()}
            </p>

            {executeResult.created > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2">
                <PlusCircle className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-400">
                  {executeResult.created} Deal(s) automatisch angelegt.{" "}
                  <Link href="/deals" className="underline underline-offset-2 hover:text-blue-300">
                    Zu den Deals →
                  </Link>
                </p>
              </div>
            )}

            {executeResult.reviewItems.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-amber-400">Manuelle Prüfung:</p>
                <ul className="text-xs text-amber-400/80 space-y-0.5">
                  {executeResult.reviewItems.slice(0, 6).map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                  {executeResult.reviewItems.length > 6 && (
                    <li>+ {executeResult.reviewItems.length - 6} weitere…</li>
                  )}
                </ul>
              </div>
            )}

            {executeResult.errors.length > 0 && (
              <ul className="space-y-0.5 text-xs text-rose-400/80">
                {executeResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                {executeResult.errors.length > 5 && (
                  <li>+ {executeResult.errors.length - 5} weitere…</li>
                )}
              </ul>
            )}
          </div>

          <Button variant="outline" onClick={fullReset}>
            Weiteren Import starten
          </Button>
        </div>
      )}
    </div>
  );
}
