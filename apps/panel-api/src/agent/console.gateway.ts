import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WebSocket as WsClient } from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { NodeAgentClient } from './agent.client';

/**
 * Bridges browser <-> node-agent live console + stats.
 *
 * Browser clients connect via Socket.IO at namespace /ws/console, authenticate
 * with a JWT, then join a server room. For each authorized server we open one
 * upstream WebSocket to the node-agent and fan its frames out to all room
 * members; console input from clients (with the control.console permission) is
 * forwarded upstream.
 */
@WebSocketGateway({ namespace: '/ws/console', cors: { origin: true } })
export class ConsoleGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ConsoleGateway.name);

  @WebSocketServer()
  server!: Server;

  /** serverId -> upstream agent socket (one per active server). */
  private upstream = new Map<string, WsClient>();
  /** serverId -> count of subscribed browser sockets. */
  private refCount = new Map<string, number>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace(
          /^Bearer /,
          '',
        );
      if (!token) throw new UnauthorizedException('missing token');
      const secret = this.config.get<AppConfig['jwt']>('jwt')!.accessSecret;
      const payload = await this.jwt.verifyAsync(token, { secret });
      client.data.userId = payload.sub;
      client.data.role = payload.role;
    } catch {
      client.emit('error', { message: 'unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const serverId: string | undefined = client.data.serverId;
    if (serverId) this.release(serverId);
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { serverId: string },
  ): Promise<void> {
    const ok = await this.canAccess(client.data.userId, client.data.role, body.serverId);
    if (!ok) {
      client.emit('error', { message: 'forbidden' });
      return;
    }
    client.data.serverId = body.serverId;
    await client.join(this.room(body.serverId));
    this.acquire(body.serverId);
    client.emit('subscribed', { serverId: body.serverId });
  }

  @SubscribeMessage('command')
  async onCommand(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { command: string },
  ): Promise<void> {
    const serverId: string | undefined = client.data.serverId;
    if (!serverId) return;
    const ok = await this.canAccess(
      client.data.userId,
      client.data.role,
      serverId,
      'control.console',
    );
    if (!ok) {
      client.emit('error', { message: 'forbidden' });
      return;
    }
    const node = await this.nodeForServer(serverId);
    if (node) await this.agent.sendCommand(node, serverId, body.command);
  }

  // ---- inbound relay from agent callbacks ---------------------------------

  /** Push a console/log line to every browser subscribed to this server. */
  emitConsole(serverId: string, frame: unknown): void {
    this.server.to(this.room(serverId)).emit('console', frame);
  }

  /** Push a live stats frame to every browser subscribed to this server. */
  emitStats(serverId: string, frame: unknown): void {
    this.server.to(this.room(serverId)).emit('stats', frame);
  }

  /** Push a power/state-change event to every browser subscribed to this server. */
  emitPower(serverId: string, frame: unknown): void {
    this.server.to(this.room(serverId)).emit('power', frame);
  }

  // ---- upstream management ------------------------------------------------

  private acquire(serverId: string): void {
    this.refCount.set(serverId, (this.refCount.get(serverId) ?? 0) + 1);
    if (!this.upstream.has(serverId)) {
      void this.openUpstream(serverId);
    }
  }

  private release(serverId: string): void {
    const n = (this.refCount.get(serverId) ?? 1) - 1;
    if (n <= 0) {
      this.refCount.delete(serverId);
      this.upstream.get(serverId)?.close();
      this.upstream.delete(serverId);
    } else {
      this.refCount.set(serverId, n);
    }
  }

  private async openUpstream(serverId: string): Promise<void> {
    const node = await this.nodeForServer(serverId);
    if (!node) return;
    const url = `${node.scheme === 'https' ? 'wss' : 'ws'}://${node.fqdn}:${
      node.daemonPort
    }/api/servers/${serverId}/ws`;
    try {
      const ws = new WsClient(url, {
        headers: { 'x-refx-node': node.id, 'x-refx-token': node.tokenHash },
        // TODO(impl): mTLS / cert pinning as in NodeAgentClient.
      });
      ws.on('message', (raw) => {
        let frame: any;
        try {
          frame = JSON.parse(raw.toString());
        } catch {
          frame = { type: 'console', line: raw.toString() };
        }
        this.server
          .to(this.room(serverId))
          .emit(frame.type === 'stats' ? 'stats' : 'console', frame);
      });
      ws.on('close', () => this.upstream.delete(serverId));
      ws.on('error', (e) =>
        this.logger.warn(`upstream ${serverId} error: ${e.message}`),
      );
      this.upstream.set(serverId, ws);
    } catch (e: any) {
      this.logger.error(`failed to open upstream for ${serverId}: ${e.message}`);
    }
  }

  // ---- authorization ------------------------------------------------------

  private async canAccess(
    userId: string,
    role: string,
    serverId: string,
    permission?: string,
  ): Promise<boolean> {
    if (role === 'ADMIN' || role === 'OWNER') return true;
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { ownerId: true },
    });
    if (!server) return false;
    if (server.ownerId === userId) return true;
    const sub = await this.prisma.subUser.findFirst({
      where: { serverId, userId, state: 'ACTIVE' },
      select: { permissions: true },
    });
    if (!sub) return false;
    if (!permission) return true;
    return sub.permissions.includes(permission);
  }

  private async nodeForServer(serverId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { node: true },
    });
    return server?.node ?? null;
  }

  private room(serverId: string): string {
    return `server:${serverId}`;
  }
}
