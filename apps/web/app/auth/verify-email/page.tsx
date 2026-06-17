"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, MailQuestion, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { LogoWordmark } from "@/components/brand/logo";
import { api, ApiError } from "@/lib/api";

type Status = "loading" | "success" | "error" | "missing";

function VerifyEmail() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [status, setStatus] = useState<Status>(token ? "loading" : "missing");
  const [message, setMessage] = useState<string>("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  // Verify exactly once even under React StrictMode's double-mount.
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        await api.auth.verifyEmail(token);
        setStatus("success");
        // Gentle auto-forward to sign-in once they've seen the confirmation.
        setTimeout(() => router.replace("/login"), 4000);
      } catch (e) {
        setStatus("error");
        setMessage(
          e instanceof ApiError
            ? e.message
            : "We couldn't verify your email. The link may have expired.",
        );
      }
    })();
  }, [token, router]);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    try {
      await api.auth.resendVerification(resendEmail.trim());
      // Enumeration-safe on the backend, so the message is intentionally generic.
      toast.success("If that account needs verifying, a new link is on its way.");
    } catch {
      toast.error("Couldn't send a new link right now. Please try again shortly.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#050814] px-4 py-12">
      {/* ReFx Glassy ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_600px_at_25%_0%,rgba(0,114,255,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_500px_at_85%_100%,rgba(0,170,255,0.12),transparent_55%)]" />

      <div className="relative w-full max-w-md rounded-2xl border border-[rgba(120,180,255,0.25)] bg-[#0a1224]/85 p-8 shadow-[0_0_60px_-15px_rgba(0,114,255,0.45)] backdrop-blur-sm">
        <div className="mb-6 flex justify-center">
          <LogoWordmark height={28} />
        </div>

        {status === "loading" && (
          <div className="space-y-4 text-center">
            <Loader2 className="mx-auto size-10 animate-spin text-[#00aaff]" />
            <h1 className="text-xl font-semibold text-white">Verifying your email…</h1>
            <p className="text-sm text-[#a9b8d0]">
              Hang tight while we confirm your address.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-5 text-center">
            <CheckCircle2 className="mx-auto size-12 text-[#22c55e]" />
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold text-white">Email verified</h1>
              <p className="text-sm text-[#a9b8d0]">
                Your account is active. You can sign in and head to your hosting panel.
              </p>
            </div>
            <Button className="w-full" onClick={() => router.replace("/login")}>
              Continue to sign in
            </Button>
            <p className="text-xs text-[#6f7d95]">Redirecting you automatically…</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-5">
            <div className="space-y-1.5 text-center">
              <XCircle className="mx-auto size-12 text-[#ef4444]" />
              <h1 className="text-xl font-semibold text-white">Verification failed</h1>
              <p className="text-sm text-[#a9b8d0]">
                {message || "This verification link is invalid or has expired."}
              </p>
            </div>

            <form onSubmit={onResend} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <Label htmlFor="resend" className="text-[#a9b8d0]">
                Resend verification email
              </Label>
              <Input
                id="resend"
                type="email"
                placeholder="you@example.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
              />
              <Button type="submit" className="w-full" variant="secondary" loading={resending}>
                <MailCheck className="size-4" /> Send a new link
              </Button>
            </form>

            <p className="text-center text-sm text-[#a9b8d0]">
              <Link href="/login" className="font-medium text-[#00aaff] hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        )}

        {status === "missing" && (
          <div className="space-y-5 text-center">
            <MailQuestion className="mx-auto size-12 text-[#00aaff]" />
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold text-white">Invalid verification link</h1>
              <p className="text-sm text-[#a9b8d0]">
                This link is missing its verification token. Please use the most recent
                link from your verification email.
              </p>
            </div>
            <Button className="w-full" onClick={() => router.replace("/login")}>
              Back to sign in
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-svh items-center justify-center bg-[#050814]">
          <Loader2 className="size-8 animate-spin text-[#00aaff]" />
        </main>
      }
    >
      <VerifyEmail />
    </Suspense>
  );
}
