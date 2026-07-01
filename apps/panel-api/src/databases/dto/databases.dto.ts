import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { DbEngine } from "@prisma/client";

export class CreateDatabaseDto {
  @ApiProperty({ enum: DbEngine })
  @IsEnum(DbEngine)
  engine!: DbEngine;

  @ApiProperty({ description: "Database name (alphanumeric + underscore)" })
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{1,48}$/, {
    message: "name must be 1-48 alphanumeric/underscore characters",
  })
  name!: string;

  @ApiPropertyOptional({
    description: 'Allowed remote host pattern (e.g. "%", "10.0.0.0/8")',
    default: "%",
  })
  @IsOptional()
  @IsString()
  remoteAccess?: string;
}

/** Admin: register/update a shared MySQL/MariaDB host to provision databases on. */
export class CreateDatabaseHostDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ enum: DbEngine, default: "MARIADB" })
  @IsOptional()
  @IsEnum(DbEngine)
  engine?: DbEngine;

  @ApiProperty({ description: "Admin connection host (panel → DB server)" })
  @IsString()
  host!: string;

  @ApiPropertyOptional({ default: 3306 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({ description: "Admin/provisioner user" })
  @IsString()
  username!: string;

  @ApiProperty({ description: "Admin password (stored AES-256-GCM encrypted)" })
  @IsString()
  password!: string;

  @ApiProperty({ description: "Hostname/IP customers connect to" })
  @IsString()
  publicHost!: string;

  @ApiPropertyOptional({ default: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDatabases?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Partial update for a host (password optional — only re-set if provided). */
export class UpdateDatabaseHostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: "New admin password (omit to keep current)",
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publicHost?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDatabases?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
