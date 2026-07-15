"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Bug, ImageUp, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import type { BugSeverity } from "@/lib/types";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "web";
const MAX_IMG = 5 * 1024 * 1024;

/** The server id if we're on a /servers/:id/* route, else undefined. */
function serverIdFromPath(pathname: string): string | undefined {
  const m = pathname.match(/\/servers\/([0-9a-f-]{36})(?:\/|$)/i);
  return m?.[1];
}

/**
 * Always-available "Report a bug" launcher for signed-in customers. Opens a
 * form that captures the report + best-effort context (page, browser, version,
 * server) and an optional screenshot, then files it to the bug board.
 */
export function ReportBugWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("MEDIUM");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setSteps("");
    setSeverity("MEDIUM");
    setFile(null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const report = await api.bugs.create({
        title: title.trim(),
        description: description.trim(),
        stepsToReproduce: steps.trim() || undefined,
        severity,
        pageUrl:
          typeof window !== "undefined"
            ? window.location.href.slice(0, 500)
            : pathname,
        userAgent:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 400)
            : undefined,
        appVersion: APP_VERSION,
        serverId: serverIdFromPath(pathname),
      });
      if (file) {
        try {
          await api.bugs.uploadAttachment(report.id, file);
        } catch {
          // The report is filed; a failed screenshot shouldn't lose it.
          toast.warning("Report sent, but the screenshot failed to upload.");
        }
      }
      return report;
    },
    onSuccess: (r) => {
      toast.success(`Thanks! Filed as BUG-${r.number}.`);
      reset();
      setOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't send the report"),
  });

  const canSubmit = title.trim().length >= 3 && description.trim().length >= 10;

  const pickFile = (f: File | null) => {
    if (!f) return setFile(null);
    if (!f.type.startsWith("image/")) {
      toast.error("Please attach an image (PNG, JPEG, WebP or GIF).");
      return;
    }
    if (f.size > MAX_IMG) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    setFile(f);
  };

  return (
    <>
      {/* Launcher — fixed, out of the way, above the footer. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a bug"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(10,14,22,0.85)] px-4 py-2.5 text-sm font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/40 hover:text-primary"
      >
        <Bug className="size-4" />
        <span className="hidden sm:inline">Report a bug</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report a bug</DialogTitle>
            <DialogDescription>
              Found something broken? Tell us what happened — we&apos;ll capture
              the page and your browser automatically so we can reproduce it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bug-title">What went wrong?</Label>
              <Input
                id="bug-title"
                placeholder="Short summary (e.g. Console stays blank after refresh)"
                value={title}
                maxLength={160}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bug-desc">Details</Label>
              <Textarea
                id="bug-desc"
                rows={4}
                placeholder="What did you expect, and what happened instead?"
                value={description}
                maxLength={8000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bug-steps">Steps to reproduce (optional)</Label>
              <Textarea
                id="bug-steps"
                rows={3}
                placeholder="1. Go to… 2. Click… 3. See…"
                value={steps}
                maxLength={4000}
                onChange={(e) => setSteps(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>How bad is it?</Label>
                <Select
                  value={severity}
                  onValueChange={(v) => setSeverity(v as BugSeverity)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low — minor / cosmetic</SelectItem>
                    <SelectItem value="MEDIUM">Medium — annoying</SelectItem>
                    <SelectItem value="HIGH">High — blocks me</SelectItem>
                    <SelectItem value="CRITICAL">
                      Critical — data loss / outage
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Screenshot (optional)</Label>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="ml-2 text-muted-foreground hover:text-destructive"
                      aria-label="Remove screenshot"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInput.current?.click()}
                  >
                    <ImageUp className="size-4" /> Attach image
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={submit.isPending}
              disabled={!canSubmit}
              onClick={() => submit.mutate()}
            >
              <Bug className="size-4" /> Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
