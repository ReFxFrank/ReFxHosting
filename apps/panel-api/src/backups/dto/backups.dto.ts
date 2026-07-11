import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateBackupDto {
  @ApiProperty()
  @IsString()
  name!: string;

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
