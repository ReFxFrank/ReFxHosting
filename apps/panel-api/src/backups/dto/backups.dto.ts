import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

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
