import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  Allocation,
  Node,
  Prisma,
  ServerTransfer,
  TransferState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient } from '../agent/agent.client';
import { NodesService } from '../nodes/nodes.service';
import { BackupsService } from '../backups/backups.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { SettingsService } from '../platform/settings.service';
import { uuidv7 } from '../common/util/uuid';
import { JOB, QUEUE, TransferJob } from '../queues/queue.constants';
import {
  pickFreePort,
  PORT_RANGE_START,
  PORT_RANGE_END,
} from './allocation-port.util';
import { buildInstallSpec, steamLogin } from '../queues/processors/install-spec.util';

/** Transfer states from which a new transfer must NOT be allowed to start. */
const ACTIVE_TRANSFER_STATES: TransferState[] = [
  TransferState.PENDING,
  TransferState.SNAPSHOTTING,
  TransferState.PROVISIONING,
  TransferState.RESTORING,
  TransferState.FINALIZING,
];

/** How long to wait for the source snapshot to reach COMPLETED before failing. */
const SNAPSHOT_TIMEOUT_MS = 30 * 60_000; // 30 min
const SNAPSHOT_POLL_MS = 5_000;

/**
 * Admin-only, Pterodactyl-style server transfer between nodes. The server keeps
 * its identity (shortId, SFTP, backups, subscription) — only its `nodeId` and
 * allocations change. The orchestration runs off the request path in a BullMQ
 * job (see TransferProcessor); this service does the cheap pre-checks + enqueue
 * (`requestTransfer`) and the full orchestration (`runTransfer`).
 *
 * Crucially the SOURCE copy is deleted only AFTER the destination is confirmed
 * installed + restored, so a failure at any point leaves the server intact on
 * its original node (rollback repoints `nodeId`/allocations back).
 */
@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    private readonly nodes: NodesService,
    private readonly backups: BackupsService,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
    @InjectQueue(QUEUE.TRANSFER) private readonly transferQueue: Queue,
  ) {}

  // ---- status queries -----------------------------------------------------

  /** The current in-flight (non-terminal) transfer for a server, if any. */
  getActiveTransfer(serverId: string): Promise<ServerTransfer | null> {
    return this.prisma.serverTransfer.findFirst({
      where: { serverId, state: { in: ACTIVE_TRANSFER_STATES } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Every transfer recorded for a server, latest first. */
  listTransfers(serverId: string): Promise<ServerTransfer[]> {
    return this.prisma.serverTransfer.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- request (cheap pre-checks + enqueue) -------------------------------

  /**
   * Validate the move, record a PENDING ServerTransfer, flip the server to
   * TRANSFERRING and enqueue the orchestration job. Returns immediately — the
   * heavy lifting happens in the worker.
   */
  async requestTransfer(
    serverId: string,
    toNodeId: string,
  ): Promise<ServerTransfer> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: {
        id: true,
        nodeId: true,
        cpuCores: true,
        memoryMb: true,
        diskMb: true,
        state: true,
      },
    });
    if (!server) throw new NotFoundException('Server not found');

    if (server.nodeId === toNodeId) {
      throw new BadRequestException(
        'Server is already on the selected node',
      );
    }

    // One active transfer per server at a time.
    const active = await this.getActiveTransfer(serverId);
    if (active) {
      throw new ConflictException('A transfer is already in progress for this server');
    }
    if (server.state === 'TRANSFERRING') {
      throw new ConflictException('Server is already transferring');
    }

    // Destination must exist, be ONLINE, not in maintenance, and have free
    // capacity for the server's reserved limits. Throws a clear 400 otherwise.
    await this.assertDestinationEligible(toNodeId, {
      cpuCores: server.cpuCores,
      memoryMb: server.memoryMb,
      diskMb: server.diskMb,
    });

    const transfer = await this.prisma.serverTransfer.create({
      data: {
        id: uuidv7(),
        serverId,
        fromNodeId: server.nodeId,
        toNodeId,
        state: TransferState.PENDING,
      },
    });

    // Mark the server TRANSFERRING up front so the UI reflects the in-flight
    // state immediately (the worker will set it back to OFFLINE / restore it).
    await this.prisma.server.update({
      where: { id: serverId },
      data: { state: 'TRANSFERRING' },
    });

    await this.transferQueue.add(JOB.TRANSFER, {
      transferId: transfer.id,
    } satisfies TransferJob);

    return transfer;
  }

  /**
   * Destination must be a real, non-deleted node that is ONLINE, out of
   * maintenance, and has free CPU / memory / disk for the server's limits.
   */
  private async assertDestinationEligible(
    nodeId: string,
    limits: { cpuCores: number; memoryMb: number; diskMb: number },
  ): Promise<void> {
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, deletedAt: null },
      select: { id: true, state: true, maintenance: true },
    });
    if (!node) throw new BadRequestException('Destination node is unavailable');
    if (node.state !== 'ONLINE' || node.maintenance) {
      throw new BadRequestException(
        'Destination node is not ONLINE / out of maintenance',
      );
    }
    const cap = await this.nodes.capacity(nodeId);
    if (
      cap.cpu.free < limits.cpuCores ||
      cap.memory.free < limits.memoryMb ||
      cap.disk.free < limits.diskMb
    ) {
      throw new BadRequestException(
        'Destination node does not have free capacity for this server',
      );
    }
  }

  // ---- orchestration (runs in the worker) ---------------------------------

  /**
   * The full move. Updates ServerTransfer.state at each step. On any failure
   * after the destination provision begins, best-effort removes the partial
   * dest copy, repoints the server back to the source node + its original
   * allocations, sets the server OFFLINE and marks the transfer FAILED. The
   * source copy is never deleted until the destination is verified, so the
   * server always survives a failed transfer.
   */
  async runTransfer(transferId: string): Promise<void> {
    const transfer = await this.prisma.serverTransfer.findUnique({
      where: { id: transferId },
    });
    if (!transfer) {
      this.logger.warn(`transfer ${transferId} not found; skipping`);
      return;
    }
    if (transfer.state !== TransferState.PENDING) {
      this.logger.warn(
        `transfer ${transferId} already in state ${transfer.state}; skipping`,
      );
      return;
    }

    const { serverId, fromNodeId, toNodeId } = transfer;

    const sourceNode = await this.prisma.node.findUnique({
      where: { id: fromNodeId },
    });
    const destNode = await this.prisma.node.findUnique({
      where: { id: toNodeId },
    });
    if (!sourceNode || !destNode) {
      await this.fail(transferId, serverId, fromNodeId, [], null, destNode, false, 'Source or destination node no longer exists');
      return;
    }

    // The original source allocations — captured so a rollback can restore them.
    const sourceAllocations = await this.prisma.allocation.findMany({
      where: { serverId },
    });

    let destAllocations: Allocation[] = [];
    let destProvisioned = false;

    try {
      // 1. Stop the server on the source so the snapshot is consistent. The
      //    server is already TRANSFERRING (set in requestTransfer).
      await this.agent.power(sourceNode, serverId, 'stop').catch((err) => {
        // A stop on an already-stopped server may error harmlessly; log + continue.
        this.logger.warn(
          `transfer ${transferId}: stop on source returned ${(err as Error).message}; continuing`,
        );
      });

      // 2. Snapshot: back up the server on the SOURCE node and wait for it to
      //    reach COMPLETED.
      await this.setState(transferId, TransferState.SNAPSHOTTING);
      const backup = await this.backups.create(serverId, {
        name: `Transfer ${new Date().toISOString()}`,
      });
      await this.prisma.serverTransfer.update({
        where: { id: transferId },
        data: { backupId: backup.id },
      });
      await this.waitForBackup(backup.id);

      // 3. Provision on the DESTINATION: allocate fresh ports on the dest node,
      //    create new Allocation rows, then install with those allocations
      //    threaded into the spec.
      await this.setState(transferId, TransferState.PROVISIONING);
      destAllocations = await this.allocateOnDest(
        destNode,
        serverId,
        sourceAllocations,
      );

      const serverForSpec = await this.loadServerForSpec(serverId);
      // The reloaded server still has BOTH source + dest allocations attached
      // (we haven't deleted the source yet). Restrict the spec to the dest set.
      const spec = await this.buildSpecWithAllocations(
        serverForSpec,
        destAllocations,
      );
      await this.agent.install(destNode, spec);
      destProvisioned = true;

      // 4. Restore the snapshot on the destination.
      await this.setState(transferId, TransferState.RESTORING);
      await this.agent.restoreBackup(destNode, serverId, backup.id);

      // 5. Repoint: server now lives on the dest node. Delete the OLD source
      //    allocations and keep the new dest ones, atomically. State -> OFFLINE.
      await this.setState(transferId, TransferState.FINALIZING);
      await this.prisma.$transaction([
        this.prisma.allocation.deleteMany({
          where: { id: { in: sourceAllocations.map((a) => a.id) } },
        }),
        this.prisma.server.update({
          where: { id: serverId },
          data: { nodeId: toNodeId, state: 'OFFLINE' },
        }),
      ]);

      // 6. Clean up the source copy now the destination is confirmed good.
      //    Best-effort — the move has already succeeded from the DB's view.
      await this.agent.deleteServer(sourceNode, serverId).catch((err) => {
        this.logger.warn(
          `transfer ${transferId}: failed to remove source copy on ${sourceNode.name}: ${(err as Error).message}`,
        );
      });

      // 7. Done.
      await this.prisma.serverTransfer.update({
        where: { id: transferId },
        data: { state: TransferState.SUCCEEDED, finishedAt: new Date() },
      });
      this.logger.log(
        `transfer ${transferId}: server ${serverId} moved ${sourceNode.name} -> ${destNode.name}`,
      );
    } catch (err) {
      await this.fail(
        transferId,
        serverId,
        fromNodeId,
        sourceAllocations,
        destAllocations,
        destNode,
        destProvisioned,
        (err as Error).message,
      );
    }
  }

  /**
   * Roll back a failed transfer. Best-effort removes the partial dest copy,
   * deletes any dest allocations we created, repoints the server back to the
   * source node + its original allocations, sets it OFFLINE, and marks the
   * transfer FAILED. The source copy was never deleted, so the server survives.
   */
  private async fail(
    transferId: string,
    serverId: string,
    fromNodeId: string,
    sourceAllocations: Allocation[],
    destAllocations: Allocation[] | null,
    destNode: Node | null,
    destProvisioned: boolean,
    error: string,
  ): Promise<void> {
    this.logger.error(`transfer ${transferId} failed: ${error}`);

    // Remove the partially-provisioned dest copy if we got that far.
    if (destProvisioned && destNode) {
      await this.agent.deleteServer(destNode, serverId).catch((e) => {
        this.logger.warn(
          `transfer ${transferId}: rollback could not remove dest copy: ${(e as Error).message}`,
        );
      });
    }

    // Drop any dest allocations we created so the server points only at source.
    if (destAllocations && destAllocations.length) {
      await this.prisma.allocation
        .deleteMany({ where: { id: { in: destAllocations.map((a) => a.id) } } })
        .catch((e) =>
          this.logger.warn(
            `transfer ${transferId}: rollback could not delete dest allocations: ${(e as Error).message}`,
          ),
        );
    }

    // Repoint the server back to the source node + OFFLINE. The source
    // allocations were never deleted, so they still bind the server.
    await this.prisma.server
      .update({
        where: { id: serverId },
        data: { nodeId: fromNodeId, state: 'OFFLINE' },
      })
      .catch((e) =>
        this.logger.error(
          `transfer ${transferId}: rollback could not repoint server: ${(e as Error).message}`,
        ),
      );

    await this.prisma.serverTransfer.update({
      where: { id: transferId },
      data: {
        state: TransferState.FAILED,
        error: error.slice(0, 1000),
        finishedAt: new Date(),
      },
    });
  }

  // ---- helpers ------------------------------------------------------------

  private async setState(
    transferId: string,
    state: TransferState,
  ): Promise<void> {
    await this.prisma.serverTransfer.update({
      where: { id: transferId },
      data: { state },
    });
  }

  /** Poll the Backup row until COMPLETED, or throw on FAILED / timeout. */
  private async waitForBackup(backupId: string): Promise<void> {
    const deadline = Date.now() + SNAPSHOT_TIMEOUT_MS;
    for (;;) {
      const backup = await this.prisma.backup.findUnique({
        where: { id: backupId },
        select: { state: true, error: true },
      });
      if (!backup) throw new Error('Snapshot backup row vanished');
      if (backup.state === 'COMPLETED') return;
      if (backup.state === 'FAILED') {
        throw new Error(`Snapshot failed: ${backup.error ?? 'unknown error'}`);
      }
      if (Date.now() > deadline) {
        throw new Error('Snapshot did not complete within the timeout');
      }
      await this.sleep(SNAPSHOT_POLL_MS);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Allocate fresh ports on the destination node — one per existing source
   * allocation (preserving the primary flag) — and create the Allocation rows.
   * Ports are picked from the dest node's configured range against its own
   * existing allocations, so they never collide with other servers there.
   */
  private async allocateOnDest(
    destNode: Node,
    serverId: string,
    sourceAllocations: Allocation[],
  ): Promise<Allocation[]> {
    const rangeStart = destNode.allocationPortStart || PORT_RANGE_START;
    const rangeEnd = destNode.allocationPortEnd || PORT_RANGE_END;

    const taken = new Set<number>(
      (
        await this.prisma.allocation.findMany({
          where: { nodeId: destNode.id },
          select: { port: true },
        })
      ).map((a) => a.port),
    );

    const created: Allocation[] = [];
    // Preserve at most one primary; order primary-first so it gets the first port.
    const ordered = [...sourceAllocations].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
    );
    for (const src of ordered) {
      let placed: Allocation | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = pickFreePort(taken, rangeStart, rangeEnd);
        if (taken.has(candidate)) {
          throw new Error(
            'Destination node has no free ports left in its allocation range',
          );
        }
        try {
          placed = await this.prisma.allocation.create({
            data: {
              id: uuidv7(),
              nodeId: destNode.id,
              ip: destNode.fqdn,
              port: candidate,
              serverId,
              isPrimary: src.isPrimary,
            },
          });
          taken.add(candidate);
          break;
        } catch (e) {
          // Unique (nodeId, ip, port) clash — retry with the next free port.
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002' &&
            attempt < 4
          ) {
            taken.add(candidate);
            continue;
          }
          throw e;
        }
      }
      if (!placed) {
        throw new Error('Could not allocate a destination port');
      }
      created.push(placed);
    }
    return created;
  }

  /** Reload the server with the includes buildInstallSpec requires. */
  private loadServerForSpec(serverId: string) {
    return this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      include: {
        node: true,
        template: { include: { variables: true } },
        allocations: true,
        variables: true,
      },
    });
  }

  /**
   * Build the dest InstallSpec from the reloaded server, but with the
   * allocations restricted to the freshly-created DEST set (the reloaded server
   * still carries the source allocations too, since we delete those only at
   * finalize). Mirrors the reinstall/provision processors' Steam handling.
   */
  private async buildSpecWithAllocations(
    server: Prisma.ServerGetPayload<{
      include: {
        node: true;
        template: { include: { variables: true } };
        allocations: true;
        variables: true;
      };
    }>,
    destAllocations: Allocation[],
  ) {
    const sftpPassword = server.sftpPasswordEnc
      ? this.crypto.decrypt(server.sftpPasswordEnc)
      : undefined;
    const ws = server.template?.supportsWorkshop ?? false;
    const steamCfg = ws ? await this.settings.steamConfig() : undefined;
    const gameSteam = steamCfg ? steamLogin(steamCfg) : undefined;
    if (gameSteam && steamCfg?.guardCode) gameSteam.guardCode = steamCfg.guardCode;

    // Provide ONLY the dest allocations to the spec builder.
    const spec = buildInstallSpec(
      { ...server, allocations: destAllocations },
      {
        // A transfer restores the data from the snapshot afterwards, so the
        // fresh install must NOT wipe — but it's a clean dir anyway. Use wipe
        // so install is deterministic; the restore overlays the data.
        wipe: true,
        sftpPassword,
        gameSteam,
      },
    );
    if (gameSteam?.guardCode) await this.settings.consumeSteamGuardCode();
    return spec;
  }
}
