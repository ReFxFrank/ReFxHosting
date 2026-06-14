import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { NodeOs } from '@prisma/client';

export class CreateNodeDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  fqdn!: string;

  @ApiProperty()
  @IsString()
  regionId!: string;

  @ApiProperty({ enum: NodeOs })
  @IsEnum(NodeOs)
  os!: NodeOs;

  @ApiProperty()
  @IsInt()
  @Min(1)
  cpuCores!: number;

  @ApiProperty()
  @IsInt()
  @Min(256)
  memoryMb!: number;

  @ApiProperty()
  @IsInt()
  @Min(1024)
  diskMb!: number;

  @ApiPropertyOptional({ default: 8443 })
  @IsOptional()
  @IsInt()
  daemonPort?: number;

  @ApiPropertyOptional({ default: 2022 })
  @IsOptional()
  @IsInt()
  sftpPort?: number;
}

export class UpdateNodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  maintenance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  cpuCores?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  memoryMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  diskMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cpuOvercommit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  memOvercommit?: number;
}

export class HeartbeatDto {
  @ApiProperty()
  @IsNumber()
  cpuPct!: number;

  @ApiProperty()
  @IsInt()
  memUsedMb!: number;

  @ApiProperty()
  @IsInt()
  diskUsedMb!: number;

  @ApiProperty()
  @IsInt()
  netRxBytes!: number;

  @ApiProperty()
  @IsInt()
  netTxBytes!: number;

  @ApiProperty()
  @IsInt()
  containers!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentVersion?: string;
}

export class NodeRegisterDto {
  @ApiProperty({ description: 'One-time bootstrap token issued by an admin' })
  @IsString()
  bootstrapToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentVersion?: string;
}
