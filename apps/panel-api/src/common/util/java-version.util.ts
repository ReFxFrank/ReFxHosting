/**
 * Auto-selects the JVM (and therefore the eclipse-temurin Docker image) required
 * by a given Minecraft: Java Edition version.
 *
 * Each Minecraft version is compiled for a minimum Java class-file version, and
 * an older JRE flatly refuses to launch a newer server:
 *
 *   UnsupportedClassVersionError: ... class file version 69.0, this version of
 *   the Java Runtime only recognizes class file versions up to 65.0
 *
 * (class 65 = Java 21, class 69 = Java 25). Java is backward-compatible — a newer
 * JRE happily runs an older server — so when the target version is unknown or
 * "latest" we pick the NEWEST supported Java. We only step DOWN for versions we
 * positively recognize as old, which is the safe direction.
 *
 * This drives both the runtime image and (because the agent runs the install
 * script in the runtime image when the install spec names no separate image) the
 * install step, so Vanilla/Paper/Fabric/Forge/NeoForge all install AND boot on a
 * compatible JVM with no manual image picking.
 */

/** Newest eclipse-temurin LTS we ship images for. */
export const NEWEST_JAVA = 25;

/**
 * Minimum Java major version for a Minecraft (Java Edition) version string.
 * Accepts "1.20.4", "1.21", calendar-style "26.1.2", "latest", or junk.
 *
 * `latestDefault` is what we assume for "latest"/unknown versions. It defaults to
 * the newest Java (right for vanilla/Paper/Fabric, which track the bleeding edge),
 * but Forge/NeoForge lag vanilla and refuse too-new JVMs, so callers pass a lower
 * cap for them via {@link latestJavaDefault}.
 */
export function requiredJavaMajor(
  mcVersion?: string | null,
  latestDefault: number = NEWEST_JAVA,
): number {
  const t = (mcVersion ?? '').trim().toLowerCase();
  // Unknown / "latest" → caller's default (newest unless capped).
  if (!t || t === 'latest') return latestDefault;

  const m = t.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return latestDefault;

  const major = Number(m[1]);
  const minor = m[2] ? Number(m[2]) : 0;
  const patch = m[3] ? Number(m[3]) : 0;

  // Calendar-style versioning (e.g. 26.x and beyond) → newest Java.
  if (major !== 1) return NEWEST_JAVA;

  // Classic 1.x.y mapping.
  if (minor <= 16) return 11; // 1.8 – 1.16.x
  if (minor <= 19) return 17; // 1.17 – 1.19.x
  if (minor === 20) return patch >= 5 ? 21 : 17; // 1.20.5 raised the floor to 21
  return 21; // 1.21.x (until a future 1.x bumps it)
}

/** Build an eclipse-temurin image ref for a Java major version. */
export function javaImage(major: number, kind: 'jre' | 'jdk' = 'jre'): string {
  return `eclipse-temurin:${major}-${kind}`;
}

/** True when an image ref is a JVM base image we own the version of. */
export function isJavaImage(image?: string | null): boolean {
  return !!image && /temurin|openjdk/i.test(image);
}

/**
 * Given a template's configured image, return the version-appropriate JVM image
 * for the chosen Minecraft version. Non-Java images (Rust, Valheim, …) pass
 * through untouched.
 */
export function resolveJavaImage(
  currentImage: string | undefined | null,
  mcVersion?: string | null,
  kind: 'jre' | 'jdk' = 'jre',
  latestDefault: number = NEWEST_JAVA,
): string | undefined {
  if (!isJavaImage(currentImage)) return currentImage ?? undefined;
  return javaImage(requiredJavaMajor(mcVersion, latestDefault), kind);
}
