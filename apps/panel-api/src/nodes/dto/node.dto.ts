import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { NodeOs } from "@prisma/client";

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

  @ApiPropertyOptional({
    default: 25565,
    description:
      "Start of the public port range allocated to servers on this node.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  allocationPortStart?: number;

  @ApiPropertyOptional({
    default: 25999,
    description:
      "End of the public port range allocated to servers on this node.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  allocationPortEnd?: number;

  @ApiPropertyOptional({
    description:
      'Optional wildcard game domain (e.g. "fra.refx.gg") for branded per-server addresses. Requires a *.<domain> DNS record pointing at this node. Leave empty to advertise the node fqdn.',
  })
  @IsOptional()
  @IsString()
  gameDomain?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      "Whether this node can host web servers (runs Caddy on :80/:443). The scheduler only places web hosting on supportsWeb nodes.",
  })
  @IsOptional()
  @IsBoolean()
  supportsWeb?: boolean;

  @ApiPropertyOptional({
    default: 1.0,
    description:
      "CPU oversell ratio: schedulable vCPU = cpuCores × this. Servers get fair-share weights + burst ceilings (not dedicated pins), so >1 is safe for bursty game workloads; 2–3 is typical for Minecraft fleets.",
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  cpuOvercommit?: number;

  @ApiPropertyOptional({
    default: 1.0,
    description:
      "Memory oversell ratio: schedulable RAM = memoryMb × this. RAM is actually consumed (JVM heaps), so keep this at or very near 1.",
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  memOvercommit?: number;

  @ApiPropertyOptional({
    description:
      "What this node costs you per month, in minor units (cents). Drives the admin margin view. Omit if you don't want to track cost.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyCostMinor?: number;

  @ApiPropertyOptional({
    default: "USD",
    description: "ISO currency of monthlyCostMinor.",
  })
  @IsOptional()
  @IsString()
  costCurrency?: string;

  @ApiPropertyOptional({
    description: 'Free-text provider/box label, e.g. "OVH Rise-3 · Hillsboro".',
  })
  @IsOptional()
  @IsString()
  provider?: string;
}

export class UpdateNodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: "Address the panel reaches the agent at (IP or hostname).",
  })
  @IsOptional()
  @IsString()
  fqdn?: string;

  @ApiPropertyOptional({ enum: ["http", "https"] })
  @IsOptional()
  @IsIn(["http", "https"])
  scheme?: string;

  @ApiPropertyOptional({
    description: "Agent control-API port (default 8443).",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  daemonPort?: number;

  @ApiPropertyOptional({ description: "Agent SFTP port (default 2022)." })
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
  @Min(0.1)
  @Max(10)
  cpuOvercommit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
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

  @ApiPropertyOptional({
    description:
      'Optional wildcard game domain (e.g. "fra.refx.gg") for branded per-server addresses. Empty string clears it.',
  })
  @IsOptional()
  @IsString()
  gameDomain?: string;

  @ApiPropertyOptional({
    description:
      "Whether this node can host web servers (runs Caddy on :80/:443).",
  })
  @IsOptional()
  @IsBoolean()
  supportsWeb?: boolean;

  @ApiPropertyOptional({
    description:
      "What this node costs you per month, in minor units (cents). Drives the admin margin view.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyCostMinor?: number;

  @ApiPropertyOptional({ description: "ISO currency of monthlyCostMinor." })
  @IsOptional()
  @IsString()
  costCurrency?: string;

  @ApiPropertyOptional({
    description: 'Free-text provider/box label, e.g. "OVH Rise-3 · Hillsboro".',
  })
  @IsOptional()
  @IsString()
  provider?: string;
}

export class UpdateAgentsDto {
  @ApiPropertyOptional({
    description: "Node ids to update; omit/empty to update every node.",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}
