import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/**
 * Replace the full permission set of an existing sub-user grant.
 */
export class UpdateSubUserDto {
  @ApiProperty({
    type: [String],
    description: 'The complete new set of permissions (replaces existing).',
    example: ['control.console', 'file.read'],
  })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
