import { jvmHeapMb } from "./server-memory.util";

describe("jvmHeapMb", () => {
  it("reserves headroom below the RAM allocation for JVM off-heap", () => {
    // 15% overhead, so heap sits below the container limit.
    expect(jvmHeapMb(4096)).toBe(4096 - Math.round(4096 * 0.15)); // 3482
    expect(jvmHeapMb(6144)).toBe(6144 - Math.round(6144 * 0.15)); // 5222
  });

  it("caps headroom at 2 GB for large servers", () => {
    // 15% of 16 GB is ~2.4 GB, clamped to 2 GB → heap 14336.
    expect(jvmHeapMb(16384)).toBe(16384 - 2048);
    expect(jvmHeapMb(32768)).toBe(32768 - 2048);
  });

  it("keeps at least a 512 MB reserve for small servers", () => {
    // 15% of 2 GB is ~307 MB, floored to 512 → heap 1536.
    expect(jvmHeapMb(2048)).toBe(2048 - 512);
  });

  it("tracks the allocation so upgrades raise the heap", () => {
    expect(jvmHeapMb(16384)).toBeGreaterThan(jvmHeapMb(3072));
  });

  it("returns 0 for a missing/zero allocation (caller skips the override)", () => {
    expect(jvmHeapMb(0)).toBe(0);
    expect(jvmHeapMb(undefined as unknown as number)).toBe(0);
  });
});
