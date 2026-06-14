import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { DbEngine } from '@prisma/client';

export class CreateDatabaseDto {
  @ApiProperty({ enum: DbEngine })
  @IsEnum(DbEngine)
  engine!: DbEngine;

  @ApiProperty({ description: 'Database name (alphanumeric + underscore)' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{1,48}$/, {
    message: 'name must be 1-48 alphanumeric/underscore characters',
  })
  name!: string;

  @ApiPropertyOptional({
    description: 'Allowed remote host pattern (e.g. "%", "10.0.0.0/8")',
    default: '%',
  })
  @IsOptional()
  @IsString()
  remoteAccess?: string;
}
