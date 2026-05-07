import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";

// Styles
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
    color: "#1a1a1a",
  },
  header: { marginBottom: 32 },
  orgName: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#666" },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#888",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: "1 solid #e5e7eb",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottom: "1 solid #f3f4f6",
  },
  rowLabel: { color: "#666", flex: 1 },
  rowValue: { flex: 2, textAlign: "right" },

  table: { marginTop: 8 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottom: "1 solid #e5e7eb",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottom: "1 solid #f3f4f6",
  },
  tableRowPaid: { backgroundColor: "#f0fdf4" },
  col1: { flex: 1 },
  col2: { flex: 2 },
  col3: { flex: 2, textAlign: "right" },
  col4: { flex: 2, textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  green: { color: "#16a34a" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#aaa",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function fmtEur(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}
function fmtDate(s: string) {
  return format(new Date(s), "dd.MM.yyyy", { locale: de });
}

type DealPdf = {
  orgName: string;
  deal: {
    customer_name: string;
    order_id: string | null;
    payment_method: string | null;
    total_price: number;
    payment_type: string;
    close_date: string;
    onboarding_done: boolean;
    update_call_done: boolean;
    notes: string | null;
    products: { name: string } | { name: string }[] | null;
    platforms: { name: string } | { name: string }[] | null;
    closers: { name: string } | { name: string }[] | null;
    sales_partners: { name: string } | { name: string }[] | null;
  };
  installments: { sequence: number; due_date: string; amount: number; paid: boolean }[];
  oneTime: { paid: boolean; paid_at: string | null } | null;
};

function resolveName(
  obj: { name: string } | { name: string }[] | null | undefined,
): string {
  if (!obj) return "—";
  if (Array.isArray(obj)) return obj[0]?.name ?? "—";
  return obj.name;
}

function DealDocument({ data }: { data: DealPdf }) {
  const { orgName, deal, installments, oneTime } = data;
  const isInstallments = deal.payment_type === "installments";
  const paidCount = installments.filter((r) => r.paid).length;
  const generatedAt = format(new Date(), "dd.MM.yyyy HH:mm", { locale: de });

  return React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.orgName }, orgName),
        React.createElement(Text, { style: styles.title }, `Deal: ${deal.customer_name}`),
        deal.order_id &&
          React.createElement(
            Text,
            { style: styles.subtitle },
            `Bestell-ID: #${deal.order_id}`,
          ),
      ),

      // Deal details
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Kerndaten"),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Produkt"),
          React.createElement(Text, { style: styles.rowValue }, resolveName(deal.products)),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Plattform"),
          React.createElement(Text, { style: styles.rowValue }, resolveName(deal.platforms)),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Zahlart"),
          React.createElement(Text, { style: styles.rowValue }, deal.payment_method ?? "—"),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Closer"),
          React.createElement(Text, { style: styles.rowValue }, resolveName(deal.closers)),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Vertriebspartner"),
          React.createElement(Text, { style: styles.rowValue }, resolveName(deal.sales_partners)),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Gesamtpreis"),
          React.createElement(
            Text,
            { style: [styles.rowValue, styles.bold] },
            fmtEur(deal.total_price),
          ),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Zahlungsart"),
          React.createElement(
            Text,
            { style: styles.rowValue },
            isInstallments ? "Ratenzahlung" : "Einmalzahlung",
          ),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Abschlussdatum"),
          React.createElement(Text, { style: styles.rowValue }, fmtDate(deal.close_date)),
        ),
        deal.notes &&
          React.createElement(
            View,
            { style: styles.row },
            React.createElement(Text, { style: styles.rowLabel }, "Notizen"),
            React.createElement(Text, { style: styles.rowValue }, deal.notes),
          ),
      ),

      // Installment table
      isInstallments &&
        installments.length > 0 &&
        React.createElement(
          View,
          { style: styles.section },
          React.createElement(
            Text,
            { style: styles.sectionTitle },
            `Raten (${paidCount}/${installments.length} bezahlt)`,
          ),
          React.createElement(
            View,
            { style: styles.table },
            React.createElement(
              View,
              { style: styles.tableHeader },
              React.createElement(Text, { style: [styles.col1, styles.bold] }, "#"),
              React.createElement(Text, { style: [styles.col2, styles.bold] }, "Fällig"),
              React.createElement(Text, { style: [styles.col3, styles.bold] }, "Betrag"),
              React.createElement(Text, { style: [styles.col4, styles.bold] }, "Status"),
            ),
            ...installments.map((r) =>
              React.createElement(
                View,
                {
                  key: r.sequence,
                  style: r.paid ? [styles.tableRow, styles.tableRowPaid] : styles.tableRow,
                },
                React.createElement(Text, { style: styles.col1 }, String(r.sequence)),
                React.createElement(Text, { style: styles.col2 }, fmtDate(r.due_date)),
                React.createElement(
                  Text,
                  { style: [styles.col3, styles.bold] },
                  fmtEur(r.amount),
                ),
                React.createElement(
                  Text,
                  { style: r.paid ? [styles.col4, styles.green] : styles.col4 },
                  r.paid ? "Bezahlt" : "Offen",
                ),
              ),
            ),
          ),
        ),

      // One-time payment status
      !isInstallments &&
        oneTime &&
        React.createElement(
          View,
          { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, "Zahlungsstatus"),
          React.createElement(
            View,
            { style: styles.row },
            React.createElement(Text, { style: styles.rowLabel }, "Status"),
            React.createElement(
              Text,
              { style: oneTime.paid ? [styles.rowValue, styles.green] : styles.rowValue },
              oneTime.paid ? "Bezahlt" : "Offen",
            ),
          ),
          oneTime.paid_at &&
            React.createElement(
              View,
              { style: styles.row },
              React.createElement(Text, { style: styles.rowLabel }, "Bezahlt am"),
              React.createElement(
                Text,
                { style: styles.rowValue },
                fmtDate(oneTime.paid_at),
              ),
            ),
        ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(Text, {}, `Erstellt: ${generatedAt}`),
        React.createElement(Text, {}, orgName),
      ),
    ),
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: deal }, { data: installments }, { data: oneTime }] = await Promise.all([
    supabase
      .from("deals")
      .select("*, platforms(name), products(name), closers(name), sales_partners(name)")
      .eq("id", id)
      .eq("organization_id", session.organizationId)
      .single(),
    supabase
      .from("installments")
      .select("sequence, due_date, amount, paid")
      .eq("deal_id", id)
      .order("sequence"),
    supabase
      .from("one_time_payments")
      .select("paid, paid_at")
      .eq("deal_id", id)
      .maybeSingle(),
  ]);

  if (!deal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: DealPdf = {
    orgName: session.organizationName,
    deal: deal as DealPdf["deal"],
    installments: (installments ?? []) as DealPdf["installments"],
    oneTime: oneTime as DealPdf["oneTime"],
  };

  const buffer = await renderToBuffer(DealDocument({ data }));

  const safeName = deal.customer_name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="deal-${safeName}.pdf"`,
    },
  });
}
