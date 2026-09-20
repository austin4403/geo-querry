"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CreditCard,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Receipt,
  X,
  Sparkles,
  Lock,
} from "lucide-react";

interface TransactionRecord {
  id: string;
  provider: "M-Pesa" | "Stripe";
  receiptId: string;
  amount: string;
  plan: string;
  status: "SETTLED" | "PENDING";
  date: string;
}

const initialTransactions: TransactionRecord[] = [
  {
    id: "tx-001",
    provider: "M-Pesa",
    receiptId: "QKH79X82LJ",
    amount: "KES 19,370",
    plan: "Professional Team (Annual)",
    status: "SETTLED",
    date: "2026-09-18 14:22",
  },
  {
    id: "tx-002",
    provider: "Stripe",
    receiptId: "ch_3Pq9Kl2eZvKYlo2C",
    amount: "$149.00 USD",
    plan: "Professional Team (Monthly)",
    status: "SETTLED",
    date: "2026-08-18 09:15",
  },
];

export default function BillingPage() {
  const [currency, setCurrency] = useState<"USD" | "KES">("USD");
  const [isMpesaModalOpen, setIsMpesaModalOpen] = useState(false);
  const [phone, setPhone] = useState("254712345678");
  const [selectedPlan, setSelectedPlan] = useState("tier_pro");
  const [mpesaStatus, setMpesaStatus] = useState<"idle" | "pushing" | "pin_prompt" | "settled">("idle");
  const [transactions, setTransactions] = useState<TransactionRecord[]>(initialTransactions);

  const plans = [
    {
      id: "tier_starter",
      name: "Starter Prospector",
      priceUsd: "$49",
      priceKes: "KES 6,370",
      description: "Essential structural GIS tools for artisanal and junior geologists.",
      features: [
        "1 Active Concession Boundary",
        "500 Outcrop Stations with Strike/Dip",
        "GeoJSON & CSV Export",
        "Offline Sync with SQLite Storage",
      ],
      popular: false,
    },
    {
      id: "tier_pro",
      name: "Professional Team",
      priceUsd: "$149",
      priceKes: "KES 19,370",
      description: "Multi-geologist field campaigns with real-time sync and assay logging.",
      features: [
        "5 Concession Tenements",
        "Unlimited Structural Measurements",
        "Cloudflare R2 Core Photo Storage",
        "Live Geologist Telemetry GPS Feed",
        "Priority Ingestion Queue",
      ],
      popular: true,
    },
    {
      id: "tier_enterprise",
      name: "Enterprise Survey",
      priceUsd: "$499",
      priceKes: "KES 64,870",
      description: "Airborne geophysics, diamond drilling, and custom coordinate systems.",
      features: [
        "Unlimited Concession Cadastre",
        "River Transactional Queue Ingestion",
        "Custom UTM Zone Reprojection",
        "Append-Only JORC Compliance Trail",
        "24/7 Dedicated Exploration Support",
      ],
      popular: false,
    },
  ];

  const handleInitiateMpesa = (e: React.FormEvent) => {
    e.preventDefault();
    setMpesaStatus("pushing");

    setTimeout(() => {
      setMpesaStatus("pin_prompt");
    }, 1500);

    setTimeout(() => {
      setMpesaStatus("settled");
      const randomReceipt = `QKH${Math.floor(100000 + Math.random() * 900000)}`;
      setTransactions([
        {
          id: `tx-${Date.now().toString().slice(-4)}`,
          provider: "M-Pesa",
          receiptId: randomReceipt,
          amount: currency === "USD" ? "$149.00 USD" : "KES 19,370",
          plan: "Professional Team",
          status: "SETTLED",
          date: new Date().toISOString().replace("T", " ").slice(0, 16),
        },
        ...transactions,
      ]);
    }, 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Billing & Invoicing
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Multi-currency billing via Safaricom M-Pesa STK Push and Stripe Checkout.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex rounded-md border border-[var(--border)] p-1 bg-[var(--background-card)]">
            <button
              onClick={() => setCurrency("USD")}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                currency === "USD"
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              USD ($)
            </button>
            <button
              onClick={() => setCurrency("KES")}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                currency === "KES"
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              KES (M-Pesa)
            </button>
          </div>
        </div>
      </div>

      {/* Subscription Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => (
          <Card
            key={p.id}
            className={`relative flex flex-col justify-between ${
              p.popular ? "border-[var(--primary)] shadow-md" : ""
            }`}
          >
            {p.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-[var(--primary)] text-white text-[10px] uppercase tracking-wider font-semibold">
                  Most Popular for Teams
                </Badge>
              </div>
            )}
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-base font-bold">{p.name}</CardTitle>
              <CardDescription className="text-xs">{p.description}</CardDescription>
              <div className="pt-3">
                <span className="text-2xl font-extrabold font-mono">
                  {currency === "USD" ? p.priceUsd : p.priceKes}
                </span>
                <span className="text-xs text-[var(--foreground-muted)]"> / month</span>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-2 space-y-4">
              <ul className="space-y-2 text-xs text-[var(--foreground-muted)]">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-center space-x-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-2 space-y-2">
                <Button
                  className="w-full flex items-center justify-center space-x-1"
                  variant={p.popular ? "primary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedPlan(p.id);
                    setIsMpesaModalOpen(true);
                  }}
                >
                  <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Pay with M-Pesa STK</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full flex items-center justify-center space-x-1"
                  onClick={() => alert(`Stripe Checkout Session initialized for plan: ${p.name}`)}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Pay with Credit Card</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Financial Ledger Card */}
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base flex items-center space-x-2">
            <Receipt className="h-4 w-4 text-[var(--primary)]" />
            <span>Immutable Payment Ledger</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Financial transactions reconciled via River transactional workers and HMAC webhooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment Provider</TableHead>
                <TableHead>Provider Receipt #</TableHead>
                <TableHead>Subscribed Plan</TableHead>
                <TableHead>Settled Amount</TableHead>
                <TableHead>Settlement Timestamp</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-medium text-xs">
                    <div className="flex items-center space-x-2">
                      {tx.provider === "M-Pesa" ? (
                        <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <CreditCard className="h-3.5 w-3.5 text-blue-500" />
                      )}
                      <span>{tx.provider}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold text-[var(--primary)]">
                    {tx.receiptId}
                  </TableCell>
                  <TableCell className="text-xs">{tx.plan}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums font-semibold">
                    {tx.amount}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                    {tx.date}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tx.status === "SETTLED" ? "success" : "warning"}>
                      {tx.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* M-Pesa STK Push Modal */}
      {isMpesaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center space-x-2">
                <Smartphone className="h-5 w-5 text-emerald-500" />
                <h3 className="font-semibold text-lg">Safaricom Lipa Na M-Pesa</h3>
              </div>
              <button
                onClick={() => {
                  setIsMpesaModalOpen(false);
                  setMpesaStatus("idle");
                }}
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {mpesaStatus === "idle" && (
              <form onSubmit={handleInitiateMpesa} className="space-y-4 text-xs">
                <p className="text-[var(--foreground-muted)] leading-relaxed">
                  Enter your Safaricom mobile phone number. An instant STK push prompt will appear on your phone requesting your M-Pesa PIN.
                </p>
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">
                    Safaricom Phone Number (MSISDN)
                  </label>
                  <Input
                    placeholder="2547XXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                  <span className="text-[10px] text-[var(--foreground-muted)]">
                    Format: 254 followed by 9 digits (e.g. 254712345678)
                  </span>
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-[var(--border)]">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsMpesaModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    Send STK Push
                  </Button>
                </div>
              </form>
            )}

            {mpesaStatus === "pushing" && (
              <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <p className="font-semibold text-sm">Initiating Daraja STK Push...</p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Dispatching push packet to Safaricom GSM network.
                </p>
              </div>
            )}

            {mpesaStatus === "pin_prompt" && (
              <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-500 animate-pulse">
                  <Lock className="h-8 w-8" />
                </div>
                <p className="font-semibold text-sm">Check your phone screen</p>
                <p className="text-xs text-[var(--foreground-muted)] max-w-xs">
                  A pop-up has been dispatched to <span className="font-mono text-emerald-400">{phone}</span>. Please enter your secret M-Pesa PIN to authorize payment.
                </p>
              </div>
            )}

            {mpesaStatus === "settled" && (
              <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <p className="font-semibold text-sm text-emerald-500">M-Pesa Payment Received!</p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Transaction reconciled and license entitlements unlocked.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setIsMpesaModalOpen(false);
                    setMpesaStatus("idle");
                  }}
                  className="mt-2"
                >
                  Return to Dashboard
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
