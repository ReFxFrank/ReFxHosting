import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { DeployMethod, VariableType } from '@prisma/client';

/** A single template variable (the "egg" variable editor row). */
export class TemplateVariableDto {
  @ApiPropertyOptional({ description: 'Existing variable id (omit to create).' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'SERVER_JARFILE' })
  @IsString()
  envName!: string;

  @ApiProperty({ example: 'Server JAR file' })
  @IsString()
  displayName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: VariableType, default: VariableType.STRING })
  @IsOptional()
  @IsEnum(VariableType)
  type?: VariableType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultValue?: string;

  @ApiPropertyOptional({ description: 'JSON validation rules.' })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  userEditable?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  userViewable?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateTemplateDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 'Minecraft: Paper' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'minecraft-paper' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case',
  })
  slug!: string;

  @ApiProperty()
  @IsString()
  author!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: DeployMethod, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(DeployMethod, { each: true })
  deployMethods?: DeployMethod[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  supportsLinux?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  supportsWindows?: boolean;

  @ApiProperty({ description: 'Map of tag-label -> image ref.' })
  @IsObject()
  dockerImages!: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  steamAppId?: number;

  @ApiProperty()
  @IsString()
  startupCommand!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startupDetect?: string;

  @ApiPropertyOptional({ default: '^C' })
  @IsOptional()
  @IsString()
  stopCommand?: string;

  @ApiProperty({ description: 'Install script spec (JSON).' })
  @IsObject()
  installScript!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Config file specs (JSON array).' })
  @IsOptional()
  configFiles?: unknown;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  recCpuCores?: number;

  @ApiPropertyOptional({ default: 1024 })
  @IsOptional()
  @IsInt()
  @Min(0)
  recMemoryMb?: number;

  @ApiPropertyOptional({ default: 5120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  recDiskMb?: number;

  @ApiPropertyOptional({ type: [TemplateVariableDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  variables?: TemplateVariableDto[];

  // ---- Public storefront metadata ----------------------------------------

  @ApiPropertyOptional({ description: 'Show this game on the public storefront.' })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ description: 'Highlight in featured sections.' })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ description: 'Storefront ordering (lower shows first).' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Marketing copy for the game detail page.' })
  @IsOptional()
  @IsString()
  longDescription?: string;

  @ApiPropertyOptional({ description: 'Homepage/catalog card image URL.' })
  @IsOptional()
  @IsString()
  cardImageUrl?: string;

  @ApiPropertyOptional({ description: 'Detail-page hero/background image URL.' })
  @IsOptional()
  @IsString()
  heroImageUrl?: string;

  @ApiPropertyOptional({ description: 'Small logo/icon URL.' })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiPropertyOptional({ type: [String], description: 'Free-form storefront tags.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/** Update payload — every field optional (PATCH semantics). */
export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}
