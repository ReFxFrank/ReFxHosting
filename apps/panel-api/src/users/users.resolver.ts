import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { GlobalRole, User } from '@prisma/client';
import { UsersService } from './users.service';
import { UserModel } from './models/user.model';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Resolver(() => UserModel)
@UseGuards(JwtAuthGuard)
export class UsersResolver {
  constructor(private readonly users: UsersService) {}

  /** The authenticated caller's own profile. */
  @Query(() => UserModel, { name: 'me' })
  async me(@CurrentUser() principal: AuthUser): Promise<UserModel> {
    const user = await this.users.getProfile(principal.id);
    return UsersResolver.toModel(user);
  }

  /**
   * Admin-only paginated user list (returns the page slice).
   *
   * PaginationDto is a class-validator REST DTO, not a GraphQL @InputType, so we
   * accept the pagination fields as discrete scalar args and rebuild the DTO
   * (preserving its `skip`/`take` getters) before delegating to the service.
   */
  @Query(() => [UserModel], { name: 'users' })
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.ADMIN)
  async usersList(
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 })
    page: number,
    @Args('pageSize', { type: () => Int, nullable: true, defaultValue: 25 })
    pageSize: number,
    @Args('q', { type: () => String, nullable: true }) q?: string,
  ): Promise<UserModel[]> {
    const pagination = new PaginationDto();
    pagination.page = page;
    pagination.pageSize = pageSize;
    pagination.q = q;

    const result = await this.users.listUsers(pagination);
    return result.data.map(UsersResolver.toModel);
  }

  /** Map a Prisma User row onto the GraphQL projection. */
  private static toModel(user: User): UserModel {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      globalRole: user.globalRole,
      state: user.state,
      createdAt: user.createdAt,
    };
  }
}
