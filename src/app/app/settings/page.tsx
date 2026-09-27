import type { Metadata } from "next";
import Link from "next/link";
import { requireSubscriber } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BillingButton } from "./billing-button";

export const metadata: Metadata = { title: "Settings" };

export default async function Settings() {
  const user = await requireSubscriber();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader><CardTitle>Your setup</CardTitle><CardDescription>Who you are, your facts, your voice and your posting rhythm.</CardDescription></CardHeader>
        <CardContent><Button variant="outline" render={<Link href="/onboarding?edit=1" />}>Edit setup</Button></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Billing</CardTitle><CardDescription>Signed in as {user.email}. Invoices, card and cancellation are handled by Stripe.</CardDescription></CardHeader>
        <CardContent><BillingButton /></CardContent>
      </Card>
    </div>
  );
}
