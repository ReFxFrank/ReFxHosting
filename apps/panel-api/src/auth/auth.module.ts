import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WebAuthnService } from './webauthn.service';
import { ApiKeyService } from './api-key.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionGuard } from './guards/permission.guard';

/**
 * Auth is Global so any feature module can apply the guards/decorators without
 * re-importing providers. Guards are exported for use via @UseGuards.
 */
@Global()
@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    WebAuthnService,
    ApiKeyService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    PermissionGuard,
  ],
  exports: [AuthService, ApiKeyService, JwtAuthGuard, RolesGuard, PermissionGuard],
})
export class AuthModule {}
