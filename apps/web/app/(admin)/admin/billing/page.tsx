"use client";

import { CreditCard } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/placeholder";

export default function AdminBillingPage() {
  return (
    <AdminPlaceholder
      title="Billing"
      description="Revenue, subscriptions and payment-gateway configuration."
      icon={CreditCard}
      note="Detailed billing administration is on the roadmap. Headline revenue is summarized on the Overview, and catalog pricing lives under Products."
      manageHref="/admin"
      manageLabel="Go to Overview"
    />
  );
}
