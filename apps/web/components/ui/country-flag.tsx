import { cn } from "@/lib/utils";

/**
 * Cross-platform country flag, fully self-hosted.
 *
 * Emoji flags (regional-indicator codepoints) DON'T render on Windows — Chrome/
 * Edge there show the two-letter code instead (e.g. "CA"). We render the flag via
 * `flag-icons`, whose SVGs are bundled into the build (no external requests), so
 * it looks identical on every OS. Unknown / non-2-letter codes fall back to a
 * styled uppercase code chip so it still looks intentional.
 */
export function CountryFlag({
  code,
  className,
}: {
  code?: string | null;
  className?: string;
}) {
  const cc = (code ?? "").trim().toLowerCase();

  if (!/^[a-z]{2}$/.test(cc)) {
    if (!cc) return null;
    return (
      <span
        className={cn(
          "inline-flex h-[13px] min-w-[18px] items-center justify-center rounded-[2px] bg-white/10 px-1 text-[9px] font-semibold uppercase leading-none text-white/70",
          className,
        )}
        aria-label={cc.toUpperCase()}
      >
        {cc}
      </span>
    );
  }

  return (
    <span
      className={cn(
        `fi fi-${cc}`,
        "inline-block h-[13px] w-[18px] rounded-[2px] align-[-2px]",
        className,
      )}
      role="img"
      aria-label={cc.toUpperCase()}
    />
  );
}
