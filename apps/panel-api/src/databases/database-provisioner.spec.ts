import { BadRequestException } from "@nestjs/common";
import { DatabaseProvisioner } from "./database-provisioner";

/**
 * Identifiers (db name + user) go straight into DDL, which can't parameterize
 * them, so `ident` MUST produce a strictly-safe [a-z0-9_] token and `assertIdent`
 * must reject anything else. These are the injection-critical bits.
 */
describe("DatabaseProvisioner.ident", () => {
  it("namespaces to s<shortId>_<name>, lowercased", () => {
    expect(DatabaseProvisioner.ident("ABC123", "mydb")).toBe("sabc123_mydb");
  });

  it("strips anything outside [a-z0-9_] (injection attempt)", () => {
    const id = DatabaseProvisioner.ident("x", "a`; DROP DATABASE y;--");
    expect(id).toMatch(/^[a-z0-9_]+$/);
    expect(id).not.toContain("`");
    expect(id).not.toContain(";");
    expect(id).not.toContain(" ");
  });

  it("caps length at 32 (MySQL user-name limit)", () => {
    const id = DatabaseProvisioner.ident("server", "x".repeat(80));
    expect(id.length).toBeLessThanOrEqual(32);
    expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it("always starts with a letter", () => {
    // A shortId of only digits still yields a letter-leading identifier.
    expect(DatabaseProvisioner.ident("123", "db")).toMatch(/^[a-z]/);
  });

  describe("assertIdent", () => {
    it("accepts a clean identifier", () => {
      expect(() => DatabaseProvisioner.assertIdent("s123_db")).not.toThrow();
    });
    it.each(["", "a b", "a;b", "a`b", "a-b", "a".repeat(65)])(
      "rejects %p",
      (bad) => {
        expect(() => DatabaseProvisioner.assertIdent(bad)).toThrow(
          BadRequestException,
        );
      },
    );
  });
});
