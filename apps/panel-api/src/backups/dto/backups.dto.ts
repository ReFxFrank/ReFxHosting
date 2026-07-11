import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateBackupDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    enum: ['ESSENTIALS', 'FULL'],
    default: 'FULL',
    description:
      'ESSENTIALS skips re-downloadable/regenerable content (libraries, caches, logs) so the archive holds only what a redeploy needs; FULL archives everything.',
  })
  @IsOptional()
  @IsIn(['ESSENTIALS', 'FULL'])
  mode?: 'ESSENTIALS' | 'FULL';

  @ApiPropertyOptional({ type: [String], description: 'Glob patterns to skip' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ignoredFiles?: string[];
}

export class UpdateBackupDto {
  @ApiProperty({ description: 'Locked backups are protected from deletion' })
  @IsBoolean()
  isLocked!: boolean;
}
