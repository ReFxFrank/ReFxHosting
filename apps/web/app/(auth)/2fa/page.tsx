"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface MfaState {
  token: string;
  methods?: ("totp" | "webauthn" | "recovery")[];
  next?: string;
  remember?: boolean;
}

export default function TwoFactorPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [mfa, setMfa] = useState<MfaState | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("refx.mfa");
    if (!raw) {
      router.replace("/login");
      return;
    }
    setMfa(JSON.parse(raw));
  }, [router]);

  async function verify(method: "totp" | "recovery") {
    if (!mfa) return;
    setSubmitting(true);
    try {
      const res = await api.auth.verifyMfa(mfa.token, code.trim(), method);
      if (res.accessToken && res.refreshToken) {
        sessionStorage.removeItem("refx.mfa");
        await setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn ?? 0 }, undefined, mfa?.remember ?? true);
        {
          const staff = useAuthStore.getState().isStaff();
          router.replace(
            mfa.next && mfa.next !== "/dashboard" ? mfa.next : staff ? "/admin" : "/dashboard",
          );
        }
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyWebAuthn() {
    if (!mfa) return;
    setSubmitting(true);
    try {
      const options = await api.auth.webauthnLoginOptions(mfa.token);
      const assertion = await startAuthentication({
        optionsJSON: options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });
      const res = await api.auth.webauthnLoginVerify(mfa.token, assertion);
      if (res.accessToken && res.refreshToken) {
        sessionStorage.removeItem("refx.mfa");
        await setSession(
          { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn ?? 0 },
          undefined,
          mfa?.remember ?? true,
        );
        const staff = useAuthStore.getState().isStaff();
        router.replace(
          mfa.next && mfa.next !== "/dashboard" ? mfa.next : staff ? "/admin" : "/dashboard",
        );
      }
    } catch (e) {
      // A user cancelling the browser prompt throws NotAllowedError — keep quiet.
      if (e instanceof DOMException && e.name === "NotAllowedError") return;
      toast.error(e instanceof ApiError ? e.message : "Passkey sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  const supportsWebAuthn = mfa?.methods?.includes("webauthn");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
          <p className="text-sm text-muted-foreground">
            {useRecovery
              ? "Enter one of your recovery codes."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          verify(useRecovery ? "recovery" : "totp");
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="code">{useRecovery ? "Recovery code" : "Authentication code"}</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            placeholder={useRecovery ? "XXXX-XXXX" : "123456"}
            className="text-center text-lg tracking-[0.3em]"
          />
        </div>
        <Button type="submit" className="w-full" loading={submitting}>
          Verify
        </Button>
      </form>

      {supportsWebAuthn && !useRecovery && (
        <Button variant="outline" className="w-full" onClick={verifyWebAuthn}>
          <Fingerprint className="size-4" /> Use a passkey instead
        </Button>
      )}

      <div className="text-center text-sm">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setUseRecovery((v) => !v)}
        >
          {useRecovery ? "Use authenticator code" : "Use a recovery code"}
        </button>
      </div>
    </div>
  );
}
