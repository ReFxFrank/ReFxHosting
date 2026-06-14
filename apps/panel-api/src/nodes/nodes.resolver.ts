import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { NodeModel } from './models/node.model';
import { NodesService } from './nodes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GlobalRole } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

/** Admin read model for nodes. */
@Resolver(() => NodeModel)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.ADMIN)
export class NodesResolver {
  constructor(private readonly nodes: NodesService) {}

  @Query(() => [NodeModel], { name: 'nodes' })
  async listNodes(
    @Args('page', { type: () => Int, nullable: true }) page = 1,
    @Args('pageSize', { type: () => Int, nullable: true }) pageSize = 25,
  ): Promise<NodeModel[]> {
    const pagination = Object.assign(new PaginationDto(), { page, pageSize });
    const result = await this.nodes.list(pagination);
    return result.data as unknown as NodeModel[];
  }
}
