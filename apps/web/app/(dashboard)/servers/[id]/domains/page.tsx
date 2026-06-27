"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, ShieldCheck, ShieldAlert, Trash2, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function DomainsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [hostname, setHostname] = useState("");
  const [dnsTarget, setDnsTarget] = useState<string | null>(null);

  const domains = useQuery({
    queryKey: ["server", id, "domains"],
    queryFn: () => api.servers.domains(id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["server", id, "domains"] });

  const add = useMutation({
    mutationFn: () => api.servers.addDomain(id, hostname.trim()),
    onSuccess: (d) => {
      setDnsTarget(d.dnsTarget);
      setHostname("");
      invalidate();
      toast.success("Domain added — point its DNS at the target below, then verify.");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't add the domain"),
  });

  const verify = useMutation({
    mutationFn: (domainId: string) => api.servers.verifyDomain(id, domainId),
    onSuccess: (d) => {
      invalidate();
      toast[d.verified ? "success" : "message"](
        d.verified
          ? "Verified — SSL is being issued automatically."
          : "DNS doesn't point here yet. Add the record and try again.",
      );
    },
  });

  const remove = useMutation({
    mutationFn: (domainId: string) => api.servers.removeDomain(id, domainId),
    onSuccess: () => {
      invalidate();
      toast.success("Domain removed");
    },
  });

  const list = domains.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Domains</h2>
        <p className="text-sm text-muted-foreground">
          Point a domain at this site. We issue and renew SSL automatically once its
          DNS resolves to the node.
        </p>
      </div>

      <Card className="p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (hostname.trim()) add.mutate();
          }}
        >
          <Input
            placeholder="example.com"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
          <Button type="submit" disabled={!hostname.trim() || add.isPending}>
            {add.isPending ? "Adding…" : "Add domain"}
          </Button>
        </form>
        {dnsTarget && (
          <p className="mt-3 text-xs text-muted-foreground">
            Create an <code className="rounded bg-muted px-1">A</code> /{" "}
            <code className="rounded bg-muted px-1">CNAME</code> record pointing to{" "}
            <code className="rounded bg-muted px-1">{dnsTarget}</code>, then press
            Verify.
          </p>
        )}
      </Card>

      {domains.isLoading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : list.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No domains yet. Add one above to make your site reachable on your own
          address.
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((d) => (
            <Card key={d.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Globe className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{d.hostname}</span>
                    {d.isPrimary && <Badge variant="muted">Primary</Badge>}
                  </div>
                  <SslBadge status={d.sslStatus} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => verify.mutate(d.id)}
                  disabled={verify.isPending}
                >
                  <RefreshCw className="size-4" /> Verify
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(d.id)}
                  disabled={remove.isPending}
                  aria-label="Remove domain"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SslBadge({ status }: { status: "PENDING" | "ACTIVE" | "FAILED" }) {
  if (status === "ACTIVE")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <ShieldCheck className="size-3.5" /> SSL active
      </span>
    );
  if (status === "FAILED")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <ShieldAlert className="size-3.5" /> SSL failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ShieldAlert className="size-3.5" /> Awaiting DNS / SSL
    </span>
  );
}
