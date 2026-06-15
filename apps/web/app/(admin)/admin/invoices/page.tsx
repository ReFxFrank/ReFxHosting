"use client";

import { ReceiptText } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/placeholder";

export default function AdminInvoicesPage() {
  return (
    <AdminPlaceholder
      title="Invoices"
      description="Issued invoices and their payment status."
      icon={ReceiptText}
      note="A platform-wide invoice browser is on the roadmap. Customers view and pay their own invoices from the client Billing area."
    />
  );
}
