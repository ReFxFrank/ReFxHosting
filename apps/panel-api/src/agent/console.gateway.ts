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
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { NodeAgentClient } from './agent.client';

/**
 * Bridges browser <-> node-agent live console + stats.
 *
 * Browser clients connect via Socket.IO at namespace /ws/console, authenticate
 * with a JWT, then join a server room. The agent pushes console/stats/power
 * frames to the panel via signed REST callbacks (POST /agent/logs|stats|
 * power-event), which fan out to room members through emitConsole/emitStats/
 * emitPower. Console input from clients (with the control.console permission) is
 * forwarded to the agent over the signed REST control API.
 */
@WebSocketGateway({ namespace: '/ws/console', cors: { origin: true } })
export class ConsoleGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ConsoleGateway.name);

  @WebSocketServer()
  server!: Server;

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
      this.logger.debug('console client rejected: invalid token');
      client.emit('error', { message: 'unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Socket.IO removes the client from its rooms automatically on disconnect;
    // there is no per-server upstream to tear down.
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
