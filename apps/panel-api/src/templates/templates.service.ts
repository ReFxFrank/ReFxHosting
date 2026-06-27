import { Injectable, NotFoundException } from '@nestjs/common';
import { GameTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import {
  CreateTemplateDto,
  TemplateVariableDto,
  UpdateTemplateDto,
} from './dto/template.dto';

/**
 * GameTemplate ("egg") authoring + read service. A template plus its
 * TemplateVariables are persisted atomically so the admin "egg editor" can save
 * a whole definition in one call, and the public catalog reads active templates.
 */
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Admin CRUD --------------------------------------------------------

  /** Admin: list every template with its category + variables. */
  list(): Promise<GameTemplate[]> {
    return this.prisma.gameTemplate.findMany({
      include: { category: true, variables: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string): Promise<GameTemplate> {
    const template = await this.prisma.gameTemplate.findUnique({
      where: { id },
      include: { category: true, variables: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  /** Create a template and its variables in one transaction. */
  async create(dto: CreateTemplateDto): Promise<GameTemplate> {
    const id = uuidv7();
    return this.prisma.gameTemplate.create({
      data: {
        id,
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        slug: dto.slug,
        author: dto.author,
        description: dto.description,
        deployMethods: dto.deployMethods ?? ['DOCKER'],
        supportsLinux: dto.supportsLinux ?? true,
        supportsWindows: dto.supportsWindows ?? false,
        dockerImages: dto.dockerImages as Prisma.InputJsonValue,
        steamAppId: dto.steamAppId ?? null,
        startupCommand: dto.startupCommand,
        startupDetect: dto.startupDetect,
        stopCommand: dto.stopCommand ?? '^C',
        installScript: dto.installScript as Prisma.InputJsonValue,
        configFiles: (dto.configFiles ?? []) as Prisma.InputJsonValue,
        recCpuCores: dto.recCpuCores ?? 1,
        recMemoryMb: dto.recMemoryMb ?? 1024,
        recDiskMb: dto.recDiskMb ?? 5120,
        isPublished: dto.isPublished ?? false,
        featured: dto.featured ?? false,
        sortOrder: dto.sortOrder ?? 0,
        longDescription: dto.longDescription ?? null,
        cardImageUrl: dto.cardImageUrl ?? null,
        heroImageUrl: dto.heroImageUrl ?? null,
        iconUrl: dto.iconUrl ?? null,
        tags: dto.tags ?? [],
        variables: dto.variables?.length
          ? { create: dto.variables.map((v) => this.variableCreate(v)) }
          : undefined,
      },
      include: { variables: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /**
   * Update a template; when `variables` is supplied it fully replaces the
   * existing set (delete-then-recreate) and bumps the template version.
   */
  async update(id: string, dto: UpdateTemplateDto): Promise<GameTemplate> {
    await this.get(id);

    const data: Prisma.GameTemplateUpdateInput = {};
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.author !== undefined) data.author = dto.author;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.deployMethods !== undefined) data.deployMethods = dto.deployMethods;
    if (dto.supportsLinux !== undefined) data.supportsLinux = dto.supportsLinux;
    if (dto.supportsWindows !== undefined) data.supportsWindows = dto.supportsWindows;
    if (dto.dockerImages !== undefined) {
      data.dockerImages = dto.dockerImages as Prisma.InputJsonValue;
    }
    if (dto.steamAppId !== undefined) data.steamAppId = dto.steamAppId;
    if (dto.startupCommand !== undefined) data.startupCommand = dto.startupCommand;
    if (dto.startupDetect !== undefined) data.startupDetect = dto.startupDetect;
    if (dto.stopCommand !== undefined) data.stopCommand = dto.stopCommand;
    if (dto.installScript !== undefined) {
      data.installScript = dto.installScript as Prisma.InputJsonValue;
    }
    if (dto.configFiles !== undefined) {
      data.configFiles = dto.configFiles as Prisma.InputJsonValue;
    }
    if (dto.recCpuCores !== undefined) data.recCpuCores = dto.recCpuCores;
    if (dto.recMemoryMb !== undefined) data.recMemoryMb = dto.recMemoryMb;
    if (dto.recDiskMb !== undefined) data.recDiskMb = dto.recDiskMb;
    // Storefront metadata.
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished;
    if (dto.featured !== undefined) data.featured = dto.featured;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.longDescription !== undefined) data.longDescription = dto.longDescription;
    if (dto.cardImageUrl !== undefined) data.cardImageUrl = dto.cardImageUrl;
    if (dto.heroImageUrl !== undefined) data.heroImageUrl = dto.heroImageUrl;
    if (dto.iconUrl !== undefined) data.iconUrl = dto.iconUrl;
    if (dto.tags !== undefined) data.tags = dto.tags;

    // Replacing variables changes the runtime definition → bump version.
    if (dto.variables !== undefined) data.version = { increment: 1 };

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (dto.variables !== undefined) {
      ops.push(
        this.prisma.templateVariable.deleteMany({ where: { templateId: id } }),
      );
      for (const v of dto.variables) {
        ops.push(
          this.prisma.templateVariable.create({
            data: { templateId: id, ...this.variableCreate(v) },
          }),
        );
      }
    }
    ops.push(this.prisma.gameTemplate.update({ where: { id }, data }));

    await this.prisma.$transaction(ops);
    return this.get(id);
  }

  /** Delete a template (only when no servers still reference it). */
  async delete(id: string): Promise<void> {
    await this.get(id);
    const inUse = await this.prisma.server.count({
      where: { templateId: id, deletedAt: null },
    });
    if (inUse > 0) {
      throw new NotFoundException(
        'Cannot delete a template still in use by servers',
      );
    }
    await this.prisma.gameTemplate.delete({ where: { id } });
  }

  // ---- Public catalog ----------------------------------------------------

  /**
   * Active templates for the buy flow. "Active" = has at least one deploy method
   * and (for now) any non-deleted template; returns the buyer-relevant fields.
   */
  listActive(filter: { categoryId?: string; search?: string; kind?: 'GAME' | 'WEB' }) {
    // Public catalog: published templates only (admins use list() for everything).
    // Default to GAME so the games grid never shows web-hosting plans; the web
    // catalog requests kind=WEB explicitly.
    const where: Prisma.GameTemplateWhereInput = {
      isPublished: true,
      kind: filter.kind ?? 'GAME',
    };
    if (filter.categoryId) where.categoryId = filter.categoryId;
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { slug: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.gameTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        author: true,
        category: { select: { id: true, name: true, slug: true, iconUrl: true } },
        dockerImages: true,
        recCpuCores: true,
        recMemoryMb: true,
        recDiskMb: true,
        supportsLinux: true,
        supportsWindows: true,
        // User-viewable variables so the order page can offer per-game config.
        variables: {
          where: { userViewable: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            envName: true,
            displayName: true,
            description: true,
            type: true,
            defaultValue: true,
            rules: true,
            userEditable: true,
            userViewable: true,
            sortOrder: true,
          },
        },
      },
    });
  }

  /** Public: all game categories (for catalog filtering). */
  listCategories() {
    return this.prisma.gameCategory.findMany({ orderBy: { name: 'asc' } });
  }

  // ---- Helpers -----------------------------------------------------------

  private variableCreate(
    v: TemplateVariableDto,
  ): Omit<Prisma.TemplateVariableCreateManyTemplateInput, 'templateId'> {
    return {
      id: v.id ?? uuidv7(),
      envName: v.envName,
      displayName: v.displayName,
      description: v.description,
      type: v.type ?? 'STRING',
      defaultValue: v.defaultValue,
      rules: (v.rules ?? {}) as Prisma.InputJsonValue,
      userEditable: v.userEditable ?? true,
      userViewable: v.userViewable ?? true,
      sortOrder: v.sortOrder ?? 0,
    };
  }
}
