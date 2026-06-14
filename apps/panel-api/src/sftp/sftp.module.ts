import { Module } from '@nestjs/common';
import { SftpService } from './sftp.service';
import { SftpController } from './sftp.controller';

/**
 * SFTP connection details + password rotation. Password stored encrypted on the
 * Server row (sftpPasswordEnc); plaintext returned only on rotate.
 */
@Module({
  controllers: [SftpController],
  providers: [SftpService],
})
export class SftpModule {}
