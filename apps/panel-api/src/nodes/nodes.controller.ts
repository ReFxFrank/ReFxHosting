import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';
import { NodesService } from './nodes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  CreateNodeDto,
  HeartbeatDto,
  NodeRegisterDto,
  UpdateNodeDto,
} from './dto/node.dto';

@ApiTags('nodes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.ADMIN)
@Controller('nodes')
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Post()
  @Audit({ action: 'node.create', targetType: 'Node' })
  create(@Body() dto: CreateNodeDto) {
    return this.nodes.create(dto);
  }

  @Get()
  list(@Query() pagination: PaginationDto) {
    return this.nodes.list(pagination);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.nodes.get(id);
  }

  @Get(':id/capacity')
  capacity(@Param('id') id: string) {
    return this.nodes.capacity(id);
  }

  @Patch(':id')
  @Audit({ action: 'node.update', targetType: 'Node', targetParam: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodes.update(id, dto);
  }

  @Post(':id/maintenance/:state')
  @Audit({ action: 'node.maintenance', targetType: 'Node', targetParam: 'id' })
  maintenance(@Param('id') id: string, @Param('state') state: string) {
    return this.nodes.setMaintenance(id, state === 'on' || state === 'true');
  }

  @Post(':id/bootstrap-token')
  @Audit({ action: 'node.bootstrap.rotate', targetType: 'Node', targetParam: 'id' })
  regenerateBootstrap(@Param('id') id: string) {
    return this.nodes.regenerateBootstrap(id);
  }

  @Delete(':id')
  @Audit({ action: 'node.delete', targetType: 'Node', targetParam: 'id' })
  remove(@Param('id') id: string) {
    return this.nodes.delete(id);
  }
}

/**
 * Endpoints the node-agent itself calls. These authenticate via the bootstrap
 * token in the body / signed requests rather than a user JWT, so they are
 * @Public() at the JWT layer and validate the token inside the service.
 */
@ApiTags('nodes-agent')
@Controller('nodes')
export class NodeAgentController {
  constructor(private readonly nodes: NodesService) {}

  @Public()
  @Post(':id/register')
  register(@Param('id') id: string, @Body() dto: NodeRegisterDto) {
    return this.nodes.registerAgent(id, dto);
  }

  @Public()
  @Post(':id/heartbeat')
  heartbeat(@Param('id') id: string, @Body() dto: HeartbeatDto) {
    // TODO(impl): verify the signed request header against node.tokenHash here
    // (the NodeAgentClient HMAC scheme) before accepting the heartbeat.
    return this.nodes.ingestHeartbeat(id, dto);
  }
}
