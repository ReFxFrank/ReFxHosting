import type { StatusLevel, StatusRegion } from "@/lib/types";
import { regionCoords, project, flagEmoji } from "@/lib/geo";

const DOT: Record<StatusLevel, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  maintenance: "bg-sky-500",
  outage: "bg-red-500",
};
const RING: Record<StatusLevel, string> = {
  operational: "bg-emerald-500/40",
  degraded: "bg-amber-500/40",
  maintenance: "bg-sky-500/40",
  outage: "bg-red-500/40",
};
const LABEL: Record<StatusLevel, string> = {
  operational: "Operational",
  degraded: "Degraded",
  maintenance: "Maintenance",
  outage: "Outage",
};

/**
 * Self-contained world panel (equirectangular, zero deps) that plots each region
 * at its datacenter coordinates, coloured by live status. Regions without a known
 * coordinate are simply omitted from the map (still listed below it on the page).
 */
export function StatusMap({ regions }: { regions: StatusRegion[] }) {
  const points = regions
    .map((r) => {
      const coords = regionCoords(r.code, r.country);
      return coords ? { region: r, ...project(coords[0], coords[1]) } : null;
    })
    .filter((p): p is { region: StatusRegion; x: number; y: number } => p !== null);

  if (points.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Network locations</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {(["operational", "degraded", "maintenance", "outage"] as StatusLevel[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${DOT[s]}`} /> {LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[radial-gradient(ellipse_at_center,rgba(20,30,48,0.6),rgba(7,11,18,0.9))]">
        {/* Graticule grid (every 30°) */}
        <svg
          viewBox="0 0 360 180"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full text-white/[0.06]"
          aria-hidden="true"
        >
          {[30, 60, 90, 120, 150].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="360" y2={y} stroke="currentColor" strokeWidth="0.5" />
          ))}
          {[30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="180" stroke="currentColor" strokeWidth="0.5" />
          ))}
          {/* Equator + prime meridian, slightly brighter */}
          <line x1="0" y1="90" x2="360" y2="90" stroke="currentColor" strokeWidth="0.8" className="text-white/[0.1]" />
          <line x1="180" y1="0" x2="180" y2="180" stroke="currentColor" strokeWidth="0.8" className="text-white/[0.1]" />
        </svg>

        {/* Markers */}
        {points.map(({ region, x, y }) => {
          const s = region.status;
          return (
            <div
              key={region.code}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
              title={`${region.name} — ${LABEL[s]} (${region.nodesUp}/${region.nodesTotal} nodes)`}
            >
              <span className="relative flex size-3 items-center justify-center">
                {s !== "operational" ? (
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${RING[s]}`} />
                ) : null}
                <span className={`relative inline-flex size-2.5 rounded-full ${DOT[s]} ring-2 ring-black/40`} />
              </span>
              <span className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                {flagEmoji(region.country)} {region.name}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
