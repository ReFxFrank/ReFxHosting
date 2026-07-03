/**
 * JVM heap size (MB) for the `SERVER_MEMORY` variable, derived from a server's
 * total RAM allocation.
 *
 * `SERVER_MEMORY` feeds `-Xmx` in the Java startup commands. It's a read-only,
 * system-managed variable: rather than a frozen template default, it must track
 * the plan's actual RAM (`Server.memoryMb`) so upgrades take effect. We reserve
 * headroom below the container's memory limit for the JVM's non-heap regions —
 * Metaspace, thread stacks, GC bookkeeping, and Netty/mod native buffers (a
 * modded server can hold 1–2 GB off-heap) — so the container isn't OOM-killed
 * the moment heap approaches the cap.
 *
 * Headroom is 15% of the allocation, clamped to [512 MB, 2048 MB]: small
 * servers keep a modest reserve, large ones don't waste more than 2 GB.
 */
export function jvmHeapMb(totalMemoryMb: number): number {
  if (!totalMemoryMb || totalMemoryMb <= 0) return 0;
  const overhead = Math.min(
    2048,
    Math.max(512, Math.round(totalMemoryMb * 0.15)),
  );
  return Math.max(512, totalMemoryMb - overhead);
}

/** Env var whose value is system-managed from the server's RAM allocation. */
export const SERVER_MEMORY_VAR = "SERVER_MEMORY";
