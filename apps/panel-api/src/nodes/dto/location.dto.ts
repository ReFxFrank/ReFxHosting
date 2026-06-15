import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ description: 'Unique short handle, e.g. "us-east".' })
  @IsString()
  @Length(2, 40)
  code!: string;

  @ApiProperty({ description: 'Display name, e.g. "US East".' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiProperty({ description: 'ISO country/area code, e.g. "US".' })
  @IsString()
  @Length(2, 40)
  country!: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 40)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 40)
  country?: string;
}
