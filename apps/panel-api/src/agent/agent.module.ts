import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NodeAgentClient } from './agent.client';
import { ConsoleGateway } from './console.gateway';
import { AgentCallbacksController } from './agent-callbacks.controller';
import { AgentSignatureGuard } from './agent-signature.guard';
import { NodesModule } from '../nodes/nodes.module';

/**
 * Exposes the NodeAgentClient (HTTPS to the Go agent), the live console
 * WebSocket gateway, and the inbound agent-callback controller (register /
 * heartbeat / stats / logs / power-event / backup-progress). Global so
 * servers/queues can inject the client freely.
 */
@Global()
@Module({
  imports: [JwtModule.register({}), NodesModule],
  controllers: [AgentCallbacksController],
  providers: [NodeAgentClient, ConsoleGateway, AgentSignatureGuard],
  exports: [NodeAgentClient],
})
export class AgentModule {}
