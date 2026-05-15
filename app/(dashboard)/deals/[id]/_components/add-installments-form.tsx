"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";

import { generateInstallmentsForDeal } from "@/lib/actions/deals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddInstallmentsForm({
  dealId,
  totalPrice,
  downPayment,
}: {
  dealId: string;
  totalPrice: number;
  downPayment: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [numberOfRates, setNumberOfRates] = useState<number>(0);
  const [firstDueDate, setFirstDueDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fmt = (v: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

  const installmentBase = totalPrice - (downPayment ?? 0);
  const perRate = numberOfRates > 0 ? installmentBase / numberOfRates : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (numberOfRates < 1) {
      setError("Bitte Anzahl Raten angeben.");
      return;
    }
    if (!firstDueDate) {
      setError("Bitte erstes Fälligkeitsdatum angeben.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await generateInstallmentsForDeal(dealId, numberOfRates, firstDueDate);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <PlusCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-300">Raten noch nicht eingetragen</p>
          <p className="text-xs text-amber-300/70 mt-0.5">
            Trage hier ein wie viele Raten vereinbart wurden.
            {installmentBase > 0 && (
              <> Zu verteilen: <span className="font-medium">{fmt(installmentBase)}</span>
              {downPayment ? ` (Gesamtpreis ${fmt(totalPrice)} − Anzahlung ${fmt(downPayment)})` : ""}</>
            )}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="add_number_of_rates" className="text-xs">
              Anzahl Raten <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add_number_of_rates"
              type="number"
              min="1"
              max="360"
              placeholder="z.B. 12"
              value={numberOfRates || ""}
              onChange={(e) => setNumberOfRates(parseInt(e.target.value) || 0)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add_first_due_date" className="text-xs">
              Erste Rate fällig am <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add_first_due_date"
              type="date"
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Vorschau */}
        {numberOfRates >= 1 && installmentBase > 0 && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/80">
            {fmt(installmentBase)} ÷ {numberOfRates} Raten ={" "}
            <span className="font-semibold text-amber-200">{fmt(perRate)} pro Rate</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <Button type="submit" size="sm" disabled={pending} className="h-8">
          {pending ? "Wird gespeichert…" : "Raten generieren"}
        </Button>
      </form>
    </div>
  );
}
