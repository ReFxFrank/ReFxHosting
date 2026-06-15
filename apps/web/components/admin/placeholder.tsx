"use client";

import Link from "next/link";
import { Construction, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Honest placeholder for an admin section whose backend exists on the customer
 * side but doesn't yet have a dedicated staff view. Keeps the admin route +
 * navigation structure in place without faking functionality.
 */
export function AdminPlaceholder({
  title,
  description,
  icon: Icon = Construction,
  note,
  manageHref,
  manageLabel,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  note: string;
  manageHref?: string;
  manageLabel?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-[hsl(var(--primary))]">
            <Icon className="size-6" />
          </span>
          <h3 className="text-base font-semibold">Staff view coming soon</h3>
          <p className="max-w-md text-sm text-muted-foreground">{note}</p>
          {manageHref && (
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href={manageHref}>{manageLabel ?? "Open related area"}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
