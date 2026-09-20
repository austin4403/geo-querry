import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Smartphone, CheckCircle } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
          Billing, Subscriptions & Invoicing
        </h1>
        <p className="text-xs text-[var(--foreground-muted)]">
          Dual payment gateway integration: Safaricom M-Pesa Daraja (KES) and Stripe (USD).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-[var(--primary)] border-2">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <Badge variant="default">CURRENT PLAN</Badge>
              <span className="font-mono text-xl font-bold">$499 / mo</span>
            </div>
            <CardTitle className="text-xl mt-2">Enterprise Survey Tier</CardTitle>
            <CardDescription>
              For operating exploration concessions and large geological field campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <ul className="space-y-2 text-xs text-[var(--foreground-muted)]">
              <li className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>Unlimited Outcrop Structural Stations & Sample Logs</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>Sub-second Real-time Field Telemetry SSE Stream</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>PostGIS Spatial Concessions & Drone Orthomosaic Hosting</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>Durable River Job Worker with Automated Retries</span>
              </li>
            </ul>

            <div className="pt-4 flex flex-col sm:flex-row gap-3">
              <Button className="flex-1 flex items-center justify-center space-x-2">
                <CreditCard className="h-4 w-4" />
                <span>Pay via Stripe</span>
              </Button>
              <Button variant="secondary" className="flex-1 flex items-center justify-center space-x-2">
                <Smartphone className="h-4 w-4 text-emerald-500" />
                <span>Pay via M-Pesa STK</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6">
            <CardTitle className="text-base">Payment Reconciliation Runbook</CardTitle>
            <CardDescription className="text-xs">
              Automated reconciliation guarantees zero duplicate seat fulfillment.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0 text-xs text-[var(--foreground-muted)] space-y-3">
            <p>
              • Webhooks are signed and verified cryptographically before mutating state.
            </p>
            <p>
              • River workers poll Safaricom Transaction Status API automatically every 30 minutes
              if webhook delivery times out or experiences packet loss.
            </p>
            <p>
              • Idempotency keys prevent double billing under network retries.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
