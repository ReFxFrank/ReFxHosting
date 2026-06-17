import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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

  @ApiPropertyOptional({ default: 25565, description: 'Start of the public port range allocated to servers on this node.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  allocationPortStart?: number;

  @ApiPropertyOptional({ default: 25999, description: 'End of the public port range allocated to servers on this node.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  allocationPortEnd?: number;
}

export class UpdateNodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Address the panel reaches the agent at (IP or hostname).' })
  @IsOptional()
  @IsString()
  fqdn?: string;

  @ApiPropertyOptional({ enum: ['http', 'https'] })
  @IsOptional()
  @IsIn(['http', 'https'])
  scheme?: string;

  @ApiPropertyOptional({ description: 'Agent control-API port (default 8443).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  daemonPort?: number;

  @ApiPropertyOptional({ description: 'Agent SFTP port (default 2022).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  sftpPort?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  allocationPortStart?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  allocationPortEnd?: number;
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

export class UpdateAgentsDto {
  @ApiPropertyOptional({
    description: 'Node ids to update; omit/empty to update every node.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}
