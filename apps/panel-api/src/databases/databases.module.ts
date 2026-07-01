import { Module } from "@nestjs/common";
import { DatabasesService } from "./databases.service";
import { DatabasesController } from "./databases.controller";
import { DatabaseProvisioner } from "./database-provisioner";
import { DatabaseHostsService } from "./database-hosts.service";

/**
 * Server databases (ServerDatabase rows) provisioned on shared MySQL/MariaDB
 * hosts (DatabaseHost). Passwords stored encrypted via the @Global CryptoService;
 * plaintext returned only on create/rotate. DatabaseHostsService is exported for
 * the admin surface to manage hosts.
 */
@Module({
  controllers: [DatabasesController],
  providers: [DatabasesService, DatabaseProvisioner, DatabaseHostsService],
  exports: [DatabaseHostsService],
})
export class DatabasesModule {}
