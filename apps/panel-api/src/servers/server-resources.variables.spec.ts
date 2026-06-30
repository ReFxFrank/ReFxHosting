import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ServerResourcesService } from "./server-resources.service";

/**
 * Variable list/set behaviour — the bug where a Discord bot's BOT_TOKEN (and any
 * template variable) had no field in the panel because listVariables returned
 * only ServerVariable override rows, never merging the template's variable
 * schema. Also covers write-only secret masking and set-time validation.
 */
describe("ServerResourcesService variables", () => {
  const TEMPLATE_VARS = [
    {
      envName: "STARTUP_CMD",
      displayName: "Startup command",
      description: "cmd",
      type: "STRING",
      defaultValue: "node index.js",
      rules: { required: true, minLength: 1 },
      userEditable: true,
      userViewable: true,
    },
    {
      envName: "BOT_TOKEN",
      displayName: "Bot token",
      description: "token",
      type: "SECRET",
      defaultValue: "",
      rules: { required: true, minLength: 10 },
      userEditable: true,
      userViewable: false,
    },
    {
      envName: "INTERNAL",
      displayName: "Internal",
      description: null,
      type: "STRING",
      defaultValue: "x",
      rules: {},
      userEditable: false,
      userViewable: false,
    },
  ];

  function makeService(overrides: { envName: string; value: string }[]) {
    const prisma = {
      server: {
        findFirst: jest.fn(async ({ select }: any) => ({
          id: "s1",
          // listVariables selects server.variables + template.variables;
          // setVariable selects template.variables filtered by envName.
          variables: select?.variables ? overrides : undefined,
          template: {
            variables: select?.template?.select?.variables?.where?.envName
              ? TEMPLATE_VARS.filter(
                  (v) =>
                    v.envName ===
                    select.template.select.variables.where.envName,
                )
              : TEMPLATE_VARS,
          },
        })),
      },
      serverVariable: {
        upsert: jest.fn(async (args: any) => ({ id: "v1", ...args.create })),
      },
    };
    return { svc: new ServerResourcesService(prisma as any), prisma };
  }

  describe("listVariables", () => {
    it("merges template variables so editable fields appear without an override row", async () => {
      const { svc } = makeService([]); // no override rows (fresh server)
      const out = await svc.listVariables("s1");
      const names = out.map((v) => v.envName);
      // STARTUP_CMD + BOT_TOKEN are viewable/editable; INTERNAL is neither -> hidden.
      expect(names).toEqual(["STARTUP_CMD", "BOT_TOKEN"]);
    });

    it("uses the override value when present, else the template default", async () => {
      const { svc } = makeService([
        { envName: "STARTUP_CMD", value: "python bot.py" },
      ]);
      const out = await svc.listVariables("s1");
      const startup = out.find((v) => v.envName === "STARTUP_CMD")!;
      expect(startup.value).toBe("python bot.py");
    });

    it("masks a write-only secret: no value returned, only isSet", async () => {
      const { svc } = makeService([
        { envName: "BOT_TOKEN", value: "super-secret-xyz" },
      ]);
      const token = (await svc.listVariables("s1")).find(
        (v) => v.envName === "BOT_TOKEN",
      )!;
      expect(token.value).toBe("");
      expect(token.isSet).toBe(true);
    });

    it("404s for a missing server", async () => {
      const prisma = { server: { findFirst: jest.fn(async () => null) } };
      const svc = new ServerResourcesService(prisma as any);
      await expect(svc.listVariables("nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("setVariable", () => {
    it("rejects a value that violates the template rules (too short for BOT_TOKEN)", async () => {
      const { svc } = makeService([]);
      await expect(
        svc.setVariable("s1", "BOT_TOKEN", "short"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects editing a non-editable template variable", async () => {
      const { svc } = makeService([]);
      await expect(
        svc.setVariable("s1", "INTERNAL", "y"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("persists a valid value", async () => {
      const { svc, prisma } = makeService([]);
      await svc.setVariable("s1", "BOT_TOKEN", "a-valid-token-value");
      expect(prisma.serverVariable.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            envName: "BOT_TOKEN",
            value: "a-valid-token-value",
          }),
        }),
      );
    });

    it("allows a custom env var not defined by the template", async () => {
      const { svc, prisma } = makeService([]);
      await svc.setVariable("s1", "DATABASE_URL", "postgres://x");
      expect(prisma.serverVariable.upsert).toHaveBeenCalled();
    });
  });
});
