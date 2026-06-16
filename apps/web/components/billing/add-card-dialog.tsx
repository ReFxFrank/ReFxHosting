"use client";

import { useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";

// Cache the Stripe.js loader per publishable key (loadStripe must run once).
const stripeCache = new Map<string, Promise<Stripe | null>>();
function getStripe(pk: string): Promise<Stripe | null> {
  if (!stripeCache.has(pk)) stripeCache.set(pk, loadStripe(pk));
  return stripeCache.get(pk)!;
}

export function AddCardDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown> | void;
}) {
  const cfg = useQuery({
    queryKey: ["billing", "config"],
    queryFn: () => api.billing.config(),
    enabled: open,
  });
  const pk = cfg.data?.stripe.publishableKey ?? "";

  // A fresh SetupIntent per open; never cached (one-time client secret).
  const setup = useQuery({
    queryKey: ["billing", "setup-intent"],
    queryFn: () => api.billing.setupCard(),
    enabled: open && !!pk,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });

  const stripePromise = useMemo(() => (pk ? getStripe(pk) : null), [pk]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a card</DialogTitle>
          <DialogDescription>
            Stored securely with Stripe for automatic renewals and one-click
            checkout. We never see your full card number.
          </DialogDescription>
        </DialogHeader>

        {!cfg.isLoading && !pk ? (
          <p className="text-sm text-muted-foreground">
            Card payments aren&apos;t configured on this platform.
          </p>
        ) : setup.isError ? (
          <p className="text-sm text-destructive">
            Couldn&apos;t start card setup. Please try again.
          </p>
        ) : !setup.data?.clientSecret || !stripePromise ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Elements
            key={setup.data.clientSecret}
            stripe={stripePromise}
            options={{ clientSecret: setup.data.clientSecret, appearance: { theme: "night" } }}
          >
            <CardForm
              setupIntentId={setup.data.setupIntentId}
              onSaved={onSaved}
              onClose={() => onOpenChange(false)}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CardForm({
  setupIntentId,
  onSaved,
  onClose,
}: {
  setupIntentId: string;
  onSaved: () => Promise<unknown> | void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error } = await stripe.confirmSetup({ elements, redirect: "if_required" });
      if (error) {
        toast.error(error.message ?? "Card setup failed");
        return;
      }
      // SetupIntent succeeded — persist the card server-side (retrieved + verified).
      await api.billing.confirmCard(setupIntentId);
      toast.success("Card saved");
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the card");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting} disabled={!stripe}>
          Save card
        </Button>
      </DialogFooter>
    </form>
  );
}
