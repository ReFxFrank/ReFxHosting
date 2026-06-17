"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import { COUNTRIES, US_STATES } from "@/lib/geo";
import { useAuthStore } from "@/store/auth";

const schema = z
  .object({
    firstName: z.string().min(1, "Required"),
    lastName: z.string().optional(),
    email: z.string().email("Enter a valid email"),
    password: z
      .string()
      .min(10, "At least 10 characters")
      .max(128, "At most 128 characters")
      .regex(/[a-z]/, "Add a lowercase letter")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/[0-9]/, "Add a number")
      .regex(/[^A-Za-z0-9]/, "Add a symbol"),
    confirm: z.string(),
    addressLine1: z.string().min(2, "Required"),
    addressLine2: z.string().optional(),
    city: z.string().min(1, "Required"),
    region: z.string().optional(),
    postalCode: z.string().min(2, "Required"),
    country: z.string().length(2, "Use a 2-letter country code"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  })
  .refine((d) => d.country.toUpperCase() !== "US" || !!d.region?.trim(), {
    message: "State is required for US addresses",
    path: ["region"],
  });
type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  // Read ?next from the URL without useSearchParams (avoids a Suspense boundary
  // requirement on this static page); preserves storefront → checkout target.
  const [next, setNext] = useState("/dashboard");
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setNext(sp.get("next") || "/dashboard");
  }, []);
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { country: "US" } });
  const country = watch("country");

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await api.auth.register({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        addressLine1: values.addressLine1,
        addressLine2: values.addressLine2 || undefined,
        city: values.city,
        region: values.region || undefined,
        postalCode: values.postalCode,
        country: values.country.toUpperCase(),
      });
      if (res.accessToken && res.refreshToken) {
        await setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn ?? 0 });
        router.replace(next);
      } else {
        toast.success("Account created. Check your inbox to verify your email.");
        router.push(
          next !== "/dashboard" ? `/login?next=${encodeURIComponent(next)}` : "/login",
        );
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Start hosting in minutes.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" {...register("firstName")} />
            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" {...register("lastName")} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              10+ characters with an uppercase, lowercase, number and symbol.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
        </div>

        <div className="space-y-1 border-t pt-4">
          <p className="text-sm font-medium">Billing address</p>
          <p className="text-xs text-muted-foreground">
            Required for tax and to place orders.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="addressLine1">Address</Label>
          <Input id="addressLine1" autoComplete="address-line1" {...register("addressLine1")} />
          {errors.addressLine1 && <p className="text-xs text-destructive">{errors.addressLine1.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="addressLine2">Address line 2 (optional)</Label>
          <Input id="addressLine2" autoComplete="address-line2" {...register("addressLine2")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" autoComplete="address-level2" {...register("city")} />
            {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="country"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.country && <p className="text-xs text-destructive">{errors.country.message}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="region">State / province</Label>
            {country === "US" ? (
              <Controller
                control={control}
                name="region"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger id="region"><SelectValue placeholder="Select state…" /></SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((s) => (
                        <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            ) : (
              <Input id="region" autoComplete="address-level1" {...register("region")} />
            )}
            {errors.region && <p className="text-xs text-destructive">{errors.region.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">Postal code</Label>
            <Input id="postalCode" autoComplete="postal-code" {...register("postalCode")} />
            {errors.postalCode && <p className="text-xs text-destructive">{errors.postalCode.message}</p>}
          </div>
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={next && next !== "/dashboard" ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
