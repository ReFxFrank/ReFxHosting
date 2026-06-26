import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TransfersService } from './transfers.service';

/**
 * Focused unit tests for the admin node-transfer orchestration in
 * TransfersService. Prisma, the BullMQ TRANSFER queue, the agent client,
 * NodesService, BackupsService, CryptoService and SettingsService are all
 * mocked — no DB / Redis / network involved.
 *
 * Covered:
 *   - requestTransfer pre-check rejections: same node, offline dest,
 *     insufficient capacity, already-transferring.
 *   - runTransfer happy path: snapshot → install dest → restore → repoint
 *     nodeId → delete source → SUCCEEDED, in that order.
 *   - runTransfer rollback: install on dest fails → source NOT deleted, server
 *     repointed back to source, state FAILED.
 */
describe('TransfersService', () => {
  const SERVER_ID = 'srv-1';
  const SOURCE_NODE_ID = 'node-src';
  const DEST_NODE_ID = 'node-dest';
  const TRANSFER_ID = 'xfer-1';
  const BACKUP_ID = 'bkp-1';

  let prisma: any;
  let agent: any;
  let nodes: any;
  let backups: any;
  let crypto: any;
  let settings: any;
  let queue: { add: jest.Mock };
  let service: TransfersService;

  const sourceNode = {
    id: SOURCE_NODE_ID,
    name: 'source',
    fqdn: 'src.example.com',
    allocationPortStart: 25565,
    allocationPortEnd: 25999,
  };
  const destNode = {
    id: DEST_NODE_ID,
    name: 'dest',
    fqdn: 'dest.example.com',
    allocationPortStart: 25565,
    allocationPortEnd: 25999,
  };

  const sourceAllocations = [
    { id: 'alloc-src-1', serverId: SERVER_ID, nodeId: SOURCE_NODE_ID, ip: 'src.example.com', port: 25565, isPrimary: true },
  ];

  function serverForSpec() {
    return {
      id: SERVER_ID,
      shortId: 'abcd1234',
      nodeId: SOURCE_NODE_ID,
      deployMethod: 'DOCKER',
      dockerImage: 'img:latest',
      startupCommand: './run',
      environment: {},
      sftpPasswordEnc: null,
      cpuCores: 2,
      memoryMb: 2048,
      swapMb: 0,
      diskMb: 10240,
      ioWeight: 500,
      node: sourceNode,
      template: {
        startupCommand: './run',
        startupDetect: '',
        stopCommand: '^C',
        installScript: {},
        configFiles: [],
        supportsWorkshop: false,
        variables: [],
      },
      allocations: sourceAllocations,
      variables: [],
    };
  }

  beforeEach(() => {
    prisma = {
      server: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      node: { findFirst: jest.fn(), findUnique: jest.fn() },
      serverTransfer: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      allocation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      backup: { findUnique: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    agent = {
      power: jest.fn().mockResolvedValue(undefined),
      install: jest.fn().mockResolvedValue(undefined),
      restoreBackup: jest.fn().mockResolvedValue(undefined),
      deleteServer: jest.fn().mockResolvedValue(undefined),
    };
    nodes = {
      capacity: jest.fn().mockResolvedValue({
        cpu: { free: 100 },
        memory: { free: 100000 },
        disk: { free: 1_000_000 },
      }),
    };
    backups = {
      create: jest.fn().mockResolvedValue({ id: BACKUP_ID }),
    };
    crypto = { decrypt: jest.fn((v: string) => v) };
    settings = {
      steamConfig: jest.fn(),
      consumeSteamGuardCode: jest.fn(),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    service = new TransfersService(
      prisma,
      agent,
      nodes,
      backups,
      crypto,
      settings,
      queue as any,
    );
  });

  // ---- requestTransfer pre-checks ----------------------------------------

  describe('requestTransfer pre-checks', () => {
    function srv(over: Partial<any> = {}) {
      return {
        id: SERVER_ID,
        nodeId: SOURCE_NODE_ID,
        cpuCores: 2,
        memoryMb: 2048,
        diskMb: 10240,
        state: 'OFFLINE',
        ...over,
      };
    }

    it('throws NotFound when the server is missing', async () => {
      prisma.server.findFirst.mockResolvedValue(null);
      await expect(
        service.requestTransfer(SERVER_ID, DEST_NODE_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects transferring to the SAME node', async () => {
      prisma.server.findFirst.mockResolvedValue(srv({ nodeId: DEST_NODE_ID }));
      await expect(
        service.requestTransfer(SERVER_ID, DEST_NODE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects when a transfer is already in progress', async () => {
      prisma.server.findFirst.mockResolvedValue(srv());
      prisma.serverTransfer.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.requestTransfer(SERVER_ID, DEST_NODE_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects when the destination is not ONLINE', async () => {
      prisma.server.findFirst.mockResolvedValue(srv());
      prisma.node.findFirst.mockResolvedValue({
        id: DEST_NODE_ID,
        state: 'OFFLINE',
        maintenance: false,
      });
      await expect(
        service.requestTransfer(SERVER_ID, DEST_NODE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects when the destination is in maintenance', async () => {
      prisma.server.findFirst.mockResolvedValue(srv());
      prisma.node.findFirst.mockResolvedValue({
        id: DEST_NODE_ID,
        state: 'ONLINE',
        maintenance: true,
      });
      await expect(
        service.requestTransfer(SERVER_ID, DEST_NODE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the destination lacks capacity', async () => {
      prisma.server.findFirst.mockResolvedValue(srv());
      prisma.node.findFirst.mockResolvedValue({
        id: DEST_NODE_ID,
        state: 'ONLINE',
        maintenance: false,
      });
      nodes.capacity.mockResolvedValue({
        cpu: { free: 0 },
        memory: { free: 0 },
        disk: { free: 0 },
      });
      await expect(
        service.requestTransfer(SERVER_ID, DEST_NODE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('on success records a PENDING transfer, flips the server TRANSFERRING and enqueues', async () => {
      prisma.server.findFirst.mockResolvedValue(srv());
      prisma.node.findFirst.mockResolvedValue({
        id: DEST_NODE_ID,
        state: 'ONLINE',
        maintenance: false,
      });
      prisma.serverTransfer.create.mockResolvedValue({
        id: TRANSFER_ID,
        serverId: SERVER_ID,
        fromNodeId: SOURCE_NODE_ID,
        toNodeId: DEST_NODE_ID,
        state: 'PENDING',
      });

      const res = await service.requestTransfer(SERVER_ID, DEST_NODE_ID);

      expect(res.id).toBe(TRANSFER_ID);
      expect(prisma.serverTransfer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          serverId: SERVER_ID,
          fromNodeId: SOURCE_NODE_ID,
          toNodeId: DEST_NODE_ID,
          state: 'PENDING',
        }),
      });
      expect(prisma.server.update).toHaveBeenCalledWith({
        where: { id: SERVER_ID },
        data: { state: 'TRANSFERRING' },
      });
      expect(queue.add).toHaveBeenCalledWith('transfer', {
        transferId: TRANSFER_ID,
      });
    });
  });

  // ---- runTransfer happy path --------------------------------------------

  describe('runTransfer', () => {
    function pendingTransfer() {
      return {
        id: TRANSFER_ID,
        serverId: SERVER_ID,
        fromNodeId: SOURCE_NODE_ID,
        toNodeId: DEST_NODE_ID,
        state: 'PENDING',
      };
    }

    function wireHappyPath() {
      prisma.serverTransfer.findUnique.mockResolvedValue(pendingTransfer());
      prisma.node.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === SOURCE_NODE_ID ? sourceNode : destNode),
      );
      // The original source allocations, captured for rollback + dest sizing.
      prisma.allocation.findMany.mockImplementation(({ where }: any) => {
        if (where.serverId === SERVER_ID) return Promise.resolve(sourceAllocations);
        // ports taken on the dest node (none)
        return Promise.resolve([]);
      });
      prisma.allocation.create.mockResolvedValue({
        id: 'alloc-dest-1',
        nodeId: DEST_NODE_ID,
        ip: destNode.fqdn,
        port: 25565,
        isPrimary: true,
      });
      prisma.server.findUniqueOrThrow.mockResolvedValue(serverForSpec());
      // Snapshot completes immediately.
      prisma.backup.findUnique.mockResolvedValue({ state: 'COMPLETED', error: null });
    }

    it('runs the move in order: snapshot → install dest → restore → repoint → delete source → SUCCEEDED', async () => {
      wireHappyPath();

      // Capture the ordering of the key side effects.
      const order: string[] = [];
      backups.create.mockImplementation(async () => {
        order.push('snapshot');
        return { id: BACKUP_ID };
      });
      agent.install.mockImplementation(async (node: any) => {
        order.push(`install:${node.id}`);
      });
      agent.restoreBackup.mockImplementation(async (node: any) => {
        order.push(`restore:${node.id}`);
      });
      const repointUpdate = jest.fn().mockResolvedValue({});
      prisma.server.update.mockImplementation((args: any) => {
        if (args.data?.nodeId) order.push(`repoint:${args.data.nodeId}`);
        return repointUpdate(args);
      });
      prisma.$transaction.mockImplementation(async (ops: any[]) => {
        // Execute the batch so the repoint update fires (records ordering).
        for (const op of ops) await op;
        return [];
      });
      agent.deleteServer.mockImplementation(async (node: any) => {
        order.push(`delete:${node.id}`);
      });

      await service.runTransfer(TRANSFER_ID);

      // Snapshot first, install on DEST, restore on DEST, repoint to DEST,
      // delete on SOURCE — in that exact sequence.
      expect(order).toEqual([
        'snapshot',
        `install:${DEST_NODE_ID}`,
        `restore:${DEST_NODE_ID}`,
        `repoint:${DEST_NODE_ID}`,
        `delete:${SOURCE_NODE_ID}`,
      ]);

      // install / restore / delete each target the correct node object.
      expect(agent.install).toHaveBeenCalledWith(destNode, expect.any(Object));
      expect(agent.restoreBackup).toHaveBeenCalledWith(destNode, SERVER_ID, BACKUP_ID);
      expect(agent.deleteServer).toHaveBeenCalledWith(sourceNode, SERVER_ID);

      // Old source allocations deleted as part of the repoint batch.
      expect(prisma.allocation.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: sourceAllocations.map((a) => a.id) } },
      });

      // Final state SUCCEEDED.
      const lastTransferUpdate =
        prisma.serverTransfer.update.mock.calls.at(-1)![0];
      expect(lastTransferUpdate.data.state).toBe('SUCCEEDED');
      expect(lastTransferUpdate.data.finishedAt).toBeInstanceOf(Date);
    });

    it('the install spec carries the freshly-created DEST allocations (not the source)', async () => {
      wireHappyPath();
      await service.runTransfer(TRANSFER_ID);
      const spec = agent.install.mock.calls[0][1];
      expect(spec.allocations).toEqual([
        { ip: destNode.fqdn, port: 25565, isPrimary: true },
      ]);
    });

    it('rolls back when the dest install fails: source NOT deleted, server repointed back, FAILED', async () => {
      wireHappyPath();
      agent.install.mockRejectedValue(new Error('agent unreachable'));

      await service.runTransfer(TRANSFER_ID);

      // The source copy is preserved — deleteServer on the SOURCE never runs.
      expect(agent.deleteServer).not.toHaveBeenCalledWith(sourceNode, SERVER_ID);
      // Restore never happened (install failed first).
      expect(agent.restoreBackup).not.toHaveBeenCalled();

      // Server repointed back to the source node + OFFLINE.
      expect(prisma.server.update).toHaveBeenCalledWith({
        where: { id: SERVER_ID },
        data: { nodeId: SOURCE_NODE_ID, state: 'OFFLINE' },
      });

      // Transfer marked FAILED with the error.
      const lastTransferUpdate =
        prisma.serverTransfer.update.mock.calls.at(-1)![0];
      expect(lastTransferUpdate.data.state).toBe('FAILED');
      expect(lastTransferUpdate.data.error).toContain('agent unreachable');
    });

    it('fails when the snapshot reports FAILED, without touching the dest', async () => {
      wireHappyPath();
      prisma.backup.findUnique.mockResolvedValue({
        state: 'FAILED',
        error: 'disk full',
      });

      await service.runTransfer(TRANSFER_ID);

      expect(agent.install).not.toHaveBeenCalled();
      expect(agent.deleteServer).not.toHaveBeenCalled();
      const lastTransferUpdate =
        prisma.serverTransfer.update.mock.calls.at(-1)![0];
      expect(lastTransferUpdate.data.state).toBe('FAILED');
    });

    it('ignores a transfer that is no longer PENDING (idempotent worker)', async () => {
      prisma.serverTransfer.findUnique.mockResolvedValue({
        ...pendingTransfer(),
        state: 'SUCCEEDED',
      });
      await service.runTransfer(TRANSFER_ID);
      expect(backups.create).not.toHaveBeenCalled();
      expect(agent.install).not.toHaveBeenCalled();
    });
  });
});
