import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { NodeAgentClient } from "../../agent/agent.client";
import { CryptoService } from "../../common/crypto/crypto.service";
import { JOB, QUEUE, SuspensionJob } from "../queue.constants";

/**
 * Applies suspend/unsuspend across the servers a job targets. A job may target a
 * single server or an entire subscription (all its servers).
 *
 * Suspending is written to be RELIABLE and IDEMPOTENT, because it's what actually
 * stops a non-paying customer from using the service:
 *   1. flag the server SUSPENDED first — this immediately blocks the panel
 *      (PermissionGuard/console gateway are view-only on SUSPENDED),
 *   2. revoke SFTP by pushing a throwaway credential to the agent so the port-2022
 *      login the customer knows stops working (the real password stays encrypted
 *      in the DB and is restored on unsuspend),
 *   3. kill the game container — and if that fails (e.g. the node is briefly
 *      unreachable) we THROW so BullMQ retries, instead of leaving a running
 *      container flagged "suspended" (players could still connect to the game
 *      port directly). The suspension queue is configured with retries + the
 *      reconciliation sweep is a further backstop.
 */
@Processor(QUEUE.SUSPENSION)
export class SuspensionProcessor extends WorkerHost {
  private readonly logger = new Logger(SuspensionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    private readonly crypto: CryptoService,
  ) {
    super();
  }

  async process(job: Job<SuspensionJob>): Promise<void> {
    if (job.name !== JOB.SUSPEND) return;
    const { serverId, subscriptionId, action, reason } = job.data;

    const servers = await this.prisma.server.findMany({
      where: {
        deletedAt: null,
        ...(serverId ? { id: serverId } : {}),
        ...(subscriptionId ? { subscriptionId } : {}),
      },
      include: { node: true },
    });

    // Track kill failures so every server is still marked SUSPENDED + SFTP-revoked
    // this pass; we rethrow at the end so BullMQ retries the ones that didn't stop.
    const killFailures: string[] = [];

    for (const server of servers) {
      if (action === "suspend") {
        // 1. Flag suspended first — blocks the panel immediately.
        await this.prisma.server.update({
          where: { id: server.id },
          data: { state: "SUSPENDED", suspendedAt: new Date() },
        });
        // 2. Revoke SFTP: push a throwaway password so the known login stops
        //    working. The real credential stays in sftpPasswordEnc for restore.
        try {
          await this.agent.setSftpCredential(
            server.node,
            server.id,
            server.shortId,
            this.crypto.token(24),
          );
        } catch (e) {
          this.logger.warn(
            `suspend: SFTP revoke failed for ${server.id}: ${(e as Error).message}`,
          );
        }
        // 3. Kill the workload — must actually stop, so surface failures.
        try {
          await this.agent.power(server.node, server.id, "kill");
        } catch (e) {
          killFailures.push(server.id);
          this.logger.error(
            `suspend: kill failed for ${server.id} (will retry): ${(e as Error).message}`,
          );
        }
        this.logger.log(`suspended ${server.id} (${reason ?? "n/a"})`);
      } else {
        // Unsuspend: restore the real SFTP credential, then lift the flag.
        if (server.sftpPasswordEnc) {
          try {
            await this.agent.setSftpCredential(
              server.node,
              server.id,
              server.shortId,
              this.crypto.decrypt(server.sftpPasswordEnc),
            );
          } catch (e) {
            this.logger.warn(
              `unsuspend: SFTP restore failed for ${server.id}: ${(e as Error).message}`,
            );
          }
        }
        await this.prisma.server.update({
          where: { id: server.id },
          data: { state: "OFFLINE", suspendedAt: null },
        });
        this.logger.log(`unsuspended ${server.id}`);
      }
    }

    if (killFailures.length) {
      throw new Error(
        `suspend: ${killFailures.length} server(s) did not stop: ${killFailures.join(", ")}`,
      );
    }
  }
}
