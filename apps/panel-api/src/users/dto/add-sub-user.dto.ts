import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEmail, IsIn, IsString } from 'class-validator';
import { GRANTABLE_PERMISSIONS } from '../../common/server-permissions';

/**
 * Grant an existing platform user access to a server with a set of granular
 * permission strings (e.g. ["console.read", "files.read", "files.write"]).
 */
export class AddSubUserDto {
  @ApiProperty({ description: 'Email of an existing ReFx user to invite.' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    type: [String],
    description:
      'Granular per-server permissions to grant. Each must be a known ' +
      'permission, an area wildcard (e.g. "files.*"), or "*".',
    example: ['console.read', 'files.read', 'files.write', 'backup.create'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(GRANTABLE_PERMISSIONS, {
    each: true,
    message: 'each value in permissions must be a known server permission',
  })
  permissions!: string[];
}
