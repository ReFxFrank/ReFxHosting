"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, MailQuestion, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { LogoWordmark } from "@/components/brand/logo";
import { api, ApiError } from "@/lib/api";

const schema = z
  .object({
    newPassword: z.string().min(10, "Use at least 10 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });
type FormValues = z.infer<typeof schema>;

function ResetPassword() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    if (!token) return;
    setSubmitting(true);
    try {
      await api.auth.resetPassword(token, values.newPassword);
      setDone(true);
      setTimeout(() => router.replace("/login"), 3500);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "This reset link is invalid or has expired.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#050814] px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_600px_at_25%_0%,rgba(0,114,255,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_500px_at_85%_100%,rgba(0,170,255,0.12),transparent_55%)]" />

      <div className="relative w-full max-w-md rounded-2xl border border-[rgba(120,180,255,0.25)] bg-[#0a1224]/85 p-8 shadow-[0_0_60px_-15px_rgba(0,114,255,0.45)] backdrop-blur-sm">
        <div className="mb-6 flex justify-center">
          <LogoWordmark height={28} />
        </div>

        {!token ? (
          <div className="space-y-5 text-center">
            <MailQuestion className="mx-auto size-12 text-[#00aaff]" />
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold text-white">Invalid reset link</h1>
              <p className="text-sm text-[#a9b8d0]">
                This link is missing its reset token. Request a fresh password reset
                email to continue.
              </p>
            </div>
            <Button className="w-full" onClick={() => router.replace("/forgot-password")}>
              Request a new link
            </Button>
            <p className="text-center text-sm text-[#a9b8d0]">
              <Link href="/login" className="font-medium text-[#00aaff] hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : done ? (
          <div className="space-y-5 text-center">
            <CheckCircle2 className="mx-auto size-12 text-[#22c55e]" />
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold text-white">Password updated</h1>
              <p className="text-sm text-[#a9b8d0]">
                Your password has been changed and other sessions were signed out. You
                can sign in with your new password now.
              </p>
            </div>
            <Button className="w-full" onClick={() => router.replace("/login")}>
              Continue to sign in
            </Button>
            <p className="text-xs text-[#6f7d95]">Redirecting you automatically…</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5 text-center">
              <h1 className="text-xl font-semibold text-white">Choose a new password</h1>
              <p className="text-sm text-[#a9b8d0]">
                Pick a strong password you don&apos;t use anywhere else.
              </p>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-[#a9b8d0]">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register("newPassword")}
                />
                {errors.newPassword && (
                  <p className="text-xs text-[#ef4444]">{errors.newPassword.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-[#a9b8d0]">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  {...register("confirm")}
                />
                {errors.confirm && (
                  <p className="text-xs text-[#ef4444]">{errors.confirm.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" loading={submitting}>
                Update password
              </Button>
            </form>
            <p className="text-center text-sm text-[#a9b8d0]">
              <Link href="/login" className="font-medium text-[#00aaff] hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-svh items-center justify-center bg-[#050814]">
          <Loader2 className="size-8 animate-spin text-[#00aaff]" />
        </main>
      }
    >
      <ResetPassword />
    </Suspense>
  );
}
