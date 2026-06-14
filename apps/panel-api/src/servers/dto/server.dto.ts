import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateServerDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Subscription that funds this server' })
  @IsString()
  subscriptionId!: string;

  @ApiProperty()
  @IsString()
  templateId!: string;

  @ApiPropertyOptional({ description: 'Pin a specific node; otherwise scheduled' })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiPropertyOptional({ description: 'Initial env var overrides' })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;
}

export class PowerActionDto {
  @ApiProperty({ enum: ['start', 'stop', 'restart', 'kill'] })
  @IsString()
  signal!: 'start' | 'stop' | 'restart' | 'kill';
}

export class SwitchGameDto {
  @ApiProperty({ description: 'Target GameTemplate id' })
  @IsString()
  templateId!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Keep the existing data volume (false wipes for a clean install)',
  })
  @IsOptional()
  @IsBoolean()
  preserveData?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;
}

export class ResizeServerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  cpuCores?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(256)
  memoryMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  swapMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1024)
  diskMb?: number;
}

export class SetVariableDto {
  @ApiProperty()
  @IsString()
  envName!: string;

  @ApiProperty()
  @IsString()
  value!: string;
}

export class CreateAllocationDto {
  @ApiProperty()
  @IsString()
  ip!: string;

  @ApiProperty()
  @IsInt()
  port!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateScheduleDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: '5-field cron' })
  @IsString()
  cron!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onlyWhenOnline?: boolean;
}

export class SendCommandDto {
  @ApiProperty({ description: 'Console command to run once' })
  @IsString()
  command!: string;
}

export class UpdateStartupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startupCommand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dockerImage?: string;
}

export class UpgradeServerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  cpuCores?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(256)
  memoryMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1024)
  diskMb?: number;
}

export class AddSubUserDto {
  @ApiProperty()
  @IsString()
  email!: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}
