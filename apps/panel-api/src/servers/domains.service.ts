import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promises as dns } from 'node:dns';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient } from '../agent/agent.client';
import { uuidv7 } from '../common/util/uuid';

/**
 * Custom domains for WEB_APP servers. A domain is mapped to the web app's local
 * upstream (localhost:<allocation port>) in the node's Caddy proxy, which issues
 * + renews TLS automatically once the hostname's DNS points at the node. The
 * customer points an A/AAAA (or CNAME) record at the node's fqdn; `verify` checks
 * that and flips sslStatus to ACTIVE.
 */
@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {}

  list(serverId: string) {
    return this.prisma.domain.findMany({
      where: { serverId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async loadWebServer(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true, allocations: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.serverType !== 'WEB_APP') {
      throw new BadRequestException('Domains are only available for web apps');
    }
    return server;
  }

  private upstreamFor(server: { allocations: { port: number; isPrimary: boolean }[] }) {
    const primary =
      server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
    if (!primary) {
      throw new BadRequestException('Web app has no network allocation yet');
    }
    return `localhost:${primary.port}`;
  }

  async add(serverId: string, hostnameRaw: string) {
    const hostname = hostnameRaw.trim().toLowerCase();
    if (!/^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/.test(hostname)) {
      throw new BadRequestException('Enter a valid domain (e.g. example.com)');
    }
    const server = await this.loadWebServer(serverId);
    const upstream = this.upstreamFor(server);

    if (await this.prisma.domain.findUnique({ where: { hostname } })) {
      throw new BadRequestException('That domain is already in use');
    }
    const isPrimary = (await this.prisma.domain.count({ where: { serverId } })) === 0;
    const domain = await this.prisma.domain.create({
      data: { id: uuidv7(), serverId, hostname, isPrimary, sslStatus: 'PENDING' },
    });

    // Register the route now; Caddy obtains the cert once DNS resolves here.
    await this.agent
      .proxyAddSite(server.node, hostname, upstream)
      .catch(() => undefined);

    return { ...domain, dnsTarget: server.node.fqdn };
  }

  async verify(serverId: string, domainId: string) {
    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, serverId },
    });
    if (!domain) throw new NotFoundException('Domain not found');
    const server = await this.loadWebServer(serverId);

    // Best-effort: does the domain resolve to (one of) the node's address(es)?
    const [domainA, nodeA] = await Promise.all([
      dns.resolve4(domain.hostname).catch(() => [] as string[]),
      dns.resolve4(server.node.fqdn).catch(() => [] as string[]),
    ]);
    const ok = domainA.length > 0 && domainA.some((a) => nodeA.includes(a));

    // (re)register the route and reflect the result.
    await this.agent
      .proxyAddSite(server.node, domain.hostname, this.upstreamFor(server))
      .catch(() => undefined);
    const updated = await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        sslStatus: ok ? 'ACTIVE' : 'PENDING',
        verifiedAt: ok ? new Date() : null,
      },
    });
    return { ...updated, dnsTarget: server.node.fqdn, verified: ok };
  }

  async remove(serverId: string, domainId: string) {
    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, serverId },
    });
    if (!domain) throw new NotFoundException('Domain not found');
    const server = await this.loadWebServer(serverId);
    await this.agent
      .proxyRemoveSite(server.node, domain.hostname)
      .catch(() => undefined);
    await this.prisma.domain.delete({ where: { id: domainId } });
    return { ok: true };
  }
}
