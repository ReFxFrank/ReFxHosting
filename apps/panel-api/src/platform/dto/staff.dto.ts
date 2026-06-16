import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Admin payload for a public "Meet the team" member. */
export class CreateStaffMemberDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ maxLength: 120, description: 'Role / title, e.g. "Founder".' })
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 600 })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  bio?: string;

  @ApiPropertyOptional({ description: 'Avatar image URL or data URL.' })
  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  avatarUrl?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Optional public link.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  link?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Display order (ascending).', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateStaffMemberDto extends PartialType(CreateStaffMemberDto) {}
