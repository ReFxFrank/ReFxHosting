"use client";

import { ShoppingCart } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/placeholder";

export default function AdminOrdersPage() {
  return (
    <AdminPlaceholder
      title="Orders"
      description="Customer purchase orders across the platform."
      icon={ShoppingCart}
      note="A dedicated staff order browser is on the roadmap. Orders are created through the storefront checkout flow and feed billing/provisioning today."
      manageHref="/admin/products"
      manageLabel="Manage products"
    />
  );
}
