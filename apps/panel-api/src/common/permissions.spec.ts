import { deriveGlobalRole, hasPermission } from "./permissions";

describe("hasPermission (hierarchical)", () => {
  it('grants everything to the "*" wildcard (owner)', () => {
    expect(hasPermission(["*"], "users.delete")).toBe(true);
    expect(hasPermission(["*"], "anything.at.all")).toBe(true);
  });

  it("grants an exact match", () => {
    expect(hasPermission(["users.suspend"], "users.suspend")).toBe(true);
  });

  it("a coarse <area>.manage implies every granular action in that area", () => {
    const perms = ["users.manage"];
    for (const p of [
      "users.read",
      "users.create",
      "users.suspend",
      "users.delete",
      "users.credit",
      "users.password",
      "users.verify-email",
    ]) {
      expect(hasPermission(perms, p)).toBe(true);
    }
    expect(hasPermission(["billing.manage"], "billing.refund")).toBe(true);
  });

  it("honours an explicit <area>.* wildcard", () => {
    expect(hasPermission(["users.*"], "users.delete")).toBe(true);
  });

  it("does NOT let a granular/read grant escalate to manage or across areas", () => {
    // A scoped action grant stays scoped — this is the least-privilege property
    // the split exists to provide.
    expect(hasPermission(["users.suspend"], "users.delete")).toBe(false);
    expect(hasPermission(["users.read"], "users.manage")).toBe(false);
    expect(hasPermission(["users.manage"], "billing.refund")).toBe(false);
    expect(hasPermission(["billing.refund"], "billing.manage")).toBe(false);
    expect(hasPermission([], "users.read")).toBe(false);
  });
});

describe("deriveGlobalRole", () => {
  it("maps an owner-tier permission to OWNER", () => {
    expect(deriveGlobalRole(["*"])).toBe("OWNER");
    expect(deriveGlobalRole(["roles.manage"])).toBe("OWNER");
    expect(deriveGlobalRole(["payments.manage"])).toBe("OWNER");
  });

  it("maps a .manage permission to ADMIN", () => {
    expect(deriveGlobalRole(["catalog.manage"])).toBe("ADMIN");
  });

  it("maps any other granted admin permission (granular or read) to SUPPORT", () => {
    expect(deriveGlobalRole(["users.read"])).toBe("SUPPORT");
    // A granular-only staff role must still read as staff, not customer.
    expect(deriveGlobalRole(["users.suspend"])).toBe("SUPPORT");
    expect(deriveGlobalRole(["billing.refund"])).toBe("SUPPORT");
  });

  it("maps no permissions to CUSTOMER", () => {
    expect(deriveGlobalRole([])).toBe("CUSTOMER");
  });

  it("respects an explicit system-role key over the permission heuristic", () => {
    expect(deriveGlobalRole([], "owner")).toBe("OWNER");
    expect(deriveGlobalRole(["*"], "support")).toBe("SUPPORT");
  });
});
