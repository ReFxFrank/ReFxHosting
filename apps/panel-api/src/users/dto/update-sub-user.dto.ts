import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsString } from 'class-validator';
import { GRANTABLE_PERMISSIONS } from '../../common/server-permissions';

/**
 * Replace the full permission set of an existing sub-user grant. An empty array
 * is allowed — it leaves the sub-user with only implicit read-only visibility.
 */
export class UpdateSubUserDto {
  @ApiProperty({
    type: [String],
    description: 'The complete new set of permissions (replaces existing).',
    example: ['console.read', 'files.read', 'files.write'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsIn(GRANTABLE_PERMISSIONS, {
    each: true,
    message: 'each value in permissions must be a known server permission',
  })
  permissions!: string[];
}
