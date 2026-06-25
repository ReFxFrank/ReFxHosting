import { Args, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GameSwitchLogModel, ServerModel } from './models/server.model';
import { ServersService } from './servers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

/** Read model for servers (scoped to the caller's ownership / membership). */
@Resolver(() => ServerModel)
@UseGuards(JwtAuthGuard)
export class ServersResolver {
  constructor(private readonly servers: ServersService) {}

  @Query(() => [ServerModel], { name: 'myServers' })
  async myServers(@CurrentUser() user: AuthUser): Promise<ServerModel[]> {
    const pagination = Object.assign(new PaginationDto(), { page: 1, pageSize: 100 });
    const result = await this.servers.list(user, pagination);
    return result.data as unknown as ServerModel[];
  }

  @Query(() => ServerModel, { name: 'server' })
  async server(
    @CurrentUser() user: AuthUser,
    @Args('id') id: string,
  ): Promise<ServerModel> {
    // Scoped to the caller — this query is NOT behind PermissionGuard, so the
    // service enforces ownership/membership (prevents cross-tenant IDOR).
    return (await this.servers.getForUser(user, id)) as unknown as ServerModel;
  }

  @Query(() => [GameSwitchLogModel], { name: 'serverGameHistory' })
  async gameHistory(
    @CurrentUser() user: AuthUser,
    @Args('id') id: string,
  ): Promise<GameSwitchLogModel[]> {
    return (await this.servers.gameHistoryForUser(user, id)) as unknown as GameSwitchLogModel[];
  }
}
