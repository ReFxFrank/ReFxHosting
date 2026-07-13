/**
 * Safe JSON-LD serialization for `<script type="application/ld+json">`.
 *
 * SECURITY (SEC-05): JSON.stringify does NOT escape <, >, or &, so a string
 * containing </script> (e.g. attacker-controlled Modrinth pack titles or
 * descriptions on the public modpack pages) can break out of the script element
 * and inject markup -- stored XSS in the panel's own origin, where bearer +
 * refresh tokens live in localStorage. Escaping the HTML-significant characters
 * (and the JS line separators U+2028/U+2029) to their unicode forms keeps the
 * JSON valid while making breakout impossible.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
