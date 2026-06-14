import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NodeAgentClient } from './agent.client';
import { ConsoleGateway } from './console.gateway';

/**
 * Exposes the NodeAgentClient (HTTPS to the Go agent) and the live console
 * WebSocket gateway. Global so servers/queues can inject the client freely.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [NodeAgentClient, ConsoleGateway],
  exports: [NodeAgentClient],
})
export class AgentModule {}
