import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IncidentImpact, IncidentStatus } from '@prisma/client';

/** Component keys an incident may affect (must match StatusService component keys). */
export const INCIDENT_COMPONENTS = ['panel-api', 'web', 'nodes', 'ios-app'] as const;

export class CreateIncidentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiProperty({ enum: IncidentImpact })
  @IsEnum(IncidentImpact)
  impact!: IncidentImpact;

  @ApiPropertyOptional({ enum: IncidentStatus, default: IncidentStatus.INVESTIGATING })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiProperty({ enum: INCIDENT_COMPONENTS, isArray: true })
  @IsArray()
  @IsIn(INCIDENT_COMPONENTS as unknown as string[], { each: true })
  components!: string[];

  @ApiProperty({ description: 'The first timeline update / message.' })
  @IsString()
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Broadcast this incident to all active customers (in-app + push + email).',
  })
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

export class AddIncidentUpdateDto {
  @ApiProperty({ enum: IncidentStatus })
  @IsEnum(IncidentStatus)
  status!: IncidentStatus;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  body!: string;
}

export class UpdateIncidentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ enum: IncidentImpact })
  @IsOptional()
  @IsEnum(IncidentImpact)
  impact?: IncidentImpact;

  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: INCIDENT_COMPONENTS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(INCIDENT_COMPONENTS as unknown as string[], { each: true })
  components?: string[];
}
