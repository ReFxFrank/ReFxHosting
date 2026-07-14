import { LEGAL } from "@/lib/legal";

/**
 * "Download for Windows" badge for ReFx Remote, the Windows desktop companion
 * app. Self-contained (inline Windows glyph, no external image). Points at the
 * latest GitHub Release (ready-to-run .exe); NEXT_PUBLIC_REMOTE_DOWNLOAD_URL
 * can override with a direct asset URL. Visually a sibling of AppStoreBadge.
 */
export function WindowsBadge({ className }: { className?: string }) {
  return (
    <a
      href={LEGAL.remoteDownloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download ReFx Remote for Windows"
      className={`inline-flex items-center gap-3 rounded-xl border border-white/15 bg-black px-4 py-2.5 text-white transition-colors hover:bg-zinc-900 ${className ?? ""}`}
    >
      <WindowsGlyph className="size-6 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="text-[10px] font-medium text-white/70">
          Download for
        </span>
        <span className="text-lg font-semibold tracking-tight">Windows</span>
      </span>
    </a>
  );
}

function WindowsGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 448 512"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M0 93.7l183.6-25.3v177.4H0V93.7zm0 324.6l183.6 25.3V268.4H0v149.9zm203.8 28L448 480V268.4H203.8v177.9zm0-380.6v180.1H448V32L203.8 65.7z" />
    </svg>
  );
}
