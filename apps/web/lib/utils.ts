import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format integer minor units (cents) into a localized currency string. */
export function formatMoney(amountMinor: number, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

/** Human-readable byte size. */
export function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes < 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/** Megabytes -> human size (schema stores MB ints). */
export function formatMb(mb: number) {
  return formatBytes(mb * 1024 * 1024, mb >= 1024 ? 1 : 0);
}

/** Relative time, e.g. "3 minutes ago". */
export function formatRelative(date: string | Date | number, locale = "en") {
  const d = new Date(date);
  const diff = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
    ["second", 1000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms || unit === "second") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return "just now";
}

/** Absolute date-time, locale aware. */
export function formatDateTime(date: string | Date | number, locale = "en") {
  return new Date(date).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDate(date: string | Date | number, locale = "en") {
  return new Date(date).toLocaleDateString(locale, { dateStyle: "medium" });
}

/** Initials for avatars. */
export function initials(name?: string | null, email?: string | null) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }
  return (email?.[0] ?? "?").toUpperCase();
}

/** Clamp helper for sliders / gauges. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function pct(used: number, total: number) {
  if (!total) return 0;
  return clamp(Math.round((used / total) * 100), 0, 100);
}

/**
 * Copy text to the clipboard, returning true on success.
 *
 * `navigator.clipboard` only exists in secure contexts (HTTPS or localhost), so
 * over plain HTTP at an IP it's undefined and throws. Fall back to a hidden
 * <textarea> + document.execCommand("copy"), which works in insecure contexts.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path below
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Whether a game template represents a voice product (e.g. TeamSpeak 3), so the
 * customer panel can label it a "Voice" service. Driven by known voice slugs.
 */
const VOICE_TEMPLATE_SLUGS = new Set(["teamspeak3", "teamspeak", "mumble", "ventrilo"]);
export function isVoiceTemplate(slug?: string | null): boolean {
  if (!slug) return false;
  return VOICE_TEMPLATE_SLUGS.has(slug) || slug.startsWith("voice-");
}

/**
 * Read an image File and return a square, downscaled JPEG data URL (center-
 * cropped). Used for avatar uploads (account + staff editor). Client-only.
 */
export function imageToAvatarDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a valid image"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unsupported"));
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Sanitize a post-login `?next=` redirect to a SAME-ORIGIN relative path. Blocks
 * open-redirect phishing: an absolute URL (`https://evil.tld`), protocol-relative
 * (`//evil.tld`) or backslash (`/\evil.tld`, which some browsers treat as `//`)
 * value falls back to `/dashboard`. Only a plain single-slash path is allowed.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (
    raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.startsWith("/\\")
  ) {
    return raw;
  }
  return "/dashboard";
}
