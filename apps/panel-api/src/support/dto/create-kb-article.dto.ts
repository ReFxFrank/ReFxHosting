import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Staff payload for authoring a knowledge-base article. */
export class CreateKbArticleDto {
  @ApiProperty({ description: 'URL slug, unique. lowercase-with-dashes.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with single dashes',
  })
  slug!: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiProperty({ description: 'Article body (markdown).' })
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ description: 'Free-form grouping category label.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
