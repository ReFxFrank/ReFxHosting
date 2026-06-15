"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (params.get("reason") === "timeout") {
      toast.info("You were signed out due to inactivity. Please sign in again.");
    }
  }, [params]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await api.auth.login(values.email, values.password);
      if (res.mfaRequired && res.mfaToken) {
        sessionStorage.setItem("refx.mfa", JSON.stringify({ token: res.mfaToken, methods: res.methods ?? ["totp"], next, remember }));
        router.push("/2fa");
        return;
      }
      if (res.accessToken && res.refreshToken) {
        // User is loaded by setSession -> refreshUser() via /auth/me.
        await setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn ?? 0 }, undefined, remember);
        // Staff with no explicit target land in the admin panel; anyone who came
        // from a deep link goes where they were headed.
        const role = useAuthStore.getState().user?.globalRole;
        const staff = role === "ADMIN" || role === "OWNER";
        router.replace(next !== "/dashboard" ? next : staff ? "/admin" : "/dashboard");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your account to continue.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-[hsl(var(--primary))]"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Keep me signed in
        </label>
        <Button type="submit" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>

      <Card className="bg-muted/40">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <KeyRound className="size-4 shrink-0" />
          <span>Passkeys & security keys are supported after sign-in via your account settings.</span>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href={next && next !== "/dashboard" ? `/register?next=${encodeURIComponent(next)}` : "/register"}
          className="font-medium text-primary hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
