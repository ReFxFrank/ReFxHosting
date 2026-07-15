import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

/** A comment on a bug report. `isInternal` is honored for staff only. */
export class AddBugCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 8000 })
  @IsString()
  @Length(1, 8000)
  body!: string;

  @ApiPropertyOptional({ description: 'Staff-only internal note (hidden from reporter).' })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
