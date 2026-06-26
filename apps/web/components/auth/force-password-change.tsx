"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Blocking dialog shown when an admin set a temporary password
 * (`user.mustChangePassword`). The user must set a new password (entering the
 * temporary one as the current password) before continuing. On success the auth
 * store is refreshed, which clears the flag and dismisses the dialog.
 */
export function ForcePasswordChange() {
  const user = useAuthStore((s) => s.user);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: () => api.account.changePassword(current, next),
    onSuccess: async () => {
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
      await bootstrap(); // refresh user → clears mustChangePassword → closes
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to change password"),
  });

  if (!user?.mustChangePassword) return null;

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const valid = current.length > 0 && next.length >= 10 && next === confirm;

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent className="[&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Choose a new password</DialogTitle>
          <DialogDescription>
            An administrator set a temporary password on your account. Set a new one to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fpc-current">Temporary password</Label>
            <Input
              id="fpc-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fpc-new">New password</Label>
            <Input
              id="fpc-new"
              type="password"
              autoComplete="new-password"
              placeholder="At least 10 chars, mixed case + number + symbol"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fpc-confirm">Confirm new password</Label>
            <Input
              id="fpc-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch ? <p className="text-xs text-destructive">Passwords don&apos;t match.</p> : null}
          </div>
          <Button
            className="w-full"
            loading={change.isPending}
            disabled={!valid}
            onClick={() => change.mutate()}
          >
            <KeyRound className="size-4" /> Update password
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
