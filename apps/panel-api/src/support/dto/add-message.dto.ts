import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Payload for adding a reply (or internal note) to an existing ticket. */
export class AddMessageDto {
  @ApiProperty({ description: 'Message body (markdown allowed).' })
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body!: string;

  @ApiPropertyOptional({
    description:
      'Staff-only internal note, hidden from the customer. Ignored for customers.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
