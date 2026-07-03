import {
  NEWEST_JAVA,
  SUPPORTED_JAVA_MAJORS,
  isJavaImage,
  javaImage,
  parseJavaOverride,
  requiredJavaMajor,
  resolveJavaImage,
} from './java-version.util';

describe('java-version util', () => {
  describe('requiredJavaMajor', () => {
    it.each([
      ['1.8', 11],
      ['1.12.2', 11],
      ['1.16.5', 11],
      ['1.17', 17],
      ['1.17.1', 17],
      ['1.18.2', 17],
      ['1.19.4', 17],
      ['1.20.1', 17],
      ['1.20.4', 17],
      ['1.20.5', 21],
      ['1.20.6', 21],
      ['1.21', 21],
      ['1.21.4', 21],
    ])('maps classic %s -> Java %i', (v, expected) => {
      expect(requiredJavaMajor(v)).toBe(expected);
    });

    it('maps calendar-style versions (26.x) to the newest Java', () => {
      // Regression: MC 26.1.2 is class-file 69 and needs Java 25, not 21.
      expect(requiredJavaMajor('26.1.2')).toBe(NEWEST_JAVA);
      expect(requiredJavaMajor('27')).toBe(NEWEST_JAVA);
    });

    it('defaults unknown / latest / junk to the newest Java', () => {
      expect(requiredJavaMajor('latest')).toBe(NEWEST_JAVA);
      expect(requiredJavaMajor(undefined)).toBe(NEWEST_JAVA);
      expect(requiredJavaMajor('')).toBe(NEWEST_JAVA);
      expect(requiredJavaMajor('snapshot')).toBe(NEWEST_JAVA);
    });

    it('honors an explicit latestDefault override for latest/unknown', () => {
      expect(requiredJavaMajor('latest', 21)).toBe(21);
      expect(requiredJavaMajor(undefined, 21)).toBe(21);
      // A concrete version ignores the override and uses the real requirement.
      expect(requiredJavaMajor('1.20.4', 21)).toBe(17);
      expect(requiredJavaMajor('26.1.2', 21)).toBe(NEWEST_JAVA);
    });
  });

  describe('image helpers', () => {
    it('builds temurin refs', () => {
      expect(javaImage(21)).toBe('eclipse-temurin:21-jre');
      expect(javaImage(25, 'jdk')).toBe('eclipse-temurin:25-jdk');
    });

    it('detects JVM images', () => {
      expect(isJavaImage('eclipse-temurin:21-jre')).toBe(true);
      expect(isJavaImage('openjdk:17')).toBe(true);
      expect(isJavaImage('ghcr.io/refx/rust:latest')).toBe(false);
      expect(isJavaImage('')).toBe(false);
      expect(isJavaImage(null)).toBe(false);
    });

    it('resolves Java images by version and leaves others untouched', () => {
      expect(resolveJavaImage('eclipse-temurin:21-jre', '26.1.2')).toBe(
        'eclipse-temurin:25-jre',
      );
      expect(resolveJavaImage('eclipse-temurin:21-jre', '1.20.4')).toBe(
        'eclipse-temurin:17-jre',
      );
      expect(resolveJavaImage('eclipse-temurin:21-jre', 'latest')).toBe(
        `eclipse-temurin:${NEWEST_JAVA}-jre`,
      );
      // Non-Java images pass through.
      expect(resolveJavaImage('ghcr.io/refx/rust:latest', '1.20.4')).toBe(
        'ghcr.io/refx/rust:latest',
      );
    });
  });

  describe('parseJavaOverride', () => {
    it('accepts every supported major', () => {
      for (const m of SUPPORTED_JAVA_MAJORS) {
        expect(parseJavaOverride(String(m))).toBe(m);
      }
    });

    it('treats unset / auto / junk / unsupported as no override', () => {
      expect(parseJavaOverride(undefined)).toBeUndefined();
      expect(parseJavaOverride('')).toBeUndefined();
      expect(parseJavaOverride('auto')).toBeUndefined();
      expect(parseJavaOverride('AUTO')).toBeUndefined();
      expect(parseJavaOverride('banana')).toBeUndefined();
      expect(parseJavaOverride('16')).toBeUndefined(); // no Temurin 16 JRE image
      expect(parseJavaOverride('99')).toBeUndefined(); // not one we ship
    });

    it('includes Java 8 for legacy Forge packs', () => {
      expect(parseJavaOverride('8')).toBe(8);
    });
  });
});
