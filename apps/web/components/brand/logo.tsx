import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * ReFx brand marks (blue logos from the brand asset set).
 * - LogoMark: the self-contained "R" app icon (blue R on navy) — use in nav.
 * - LogoWordmark: the "REFX" wordmark — use on auth / storefront headers.
 */
export function LogoMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/brand/refx-icon.png"
      alt="ReFx"
      width={size}
      height={size}
      priority
      unoptimized
      className={cn("rounded-md", className)}
    />
  );
}

export function LogoWordmark({
  height = 28,
  className,
}: {
  height?: number;
  className?: string;
}) {
  // Source banner is 4096x832 (~4.92:1).
  const width = Math.round((height * 4096) / 832);
  return (
    <Image
      src="/brand/refx-wordmark.png"
      alt="ReFx"
      width={width}
      height={height}
      priority
      unoptimized
      className={className}
    />
  );
}
