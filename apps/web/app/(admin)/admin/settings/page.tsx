"use client";

import { Settings } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/placeholder";

export default function AdminSettingsPage() {
  return (
    <AdminPlaceholder
      title="Settings"
      description="Platform-wide configuration for the panel."
      icon={Settings}
      note="System settings administration is on the roadmap. Branding, SMTP and gateway secrets are configured via environment variables for now."
    />
  );
}
