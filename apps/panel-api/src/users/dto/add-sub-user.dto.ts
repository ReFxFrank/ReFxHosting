import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEmail, IsString } from 'class-validator';

/**
 * Grant an existing platform user access to a server with a set of granular
 * permission strings (e.g. ["control.console", "file.read"]).
 */
export class AddSubUserDto {
  @ApiProperty({ description: 'Email of an existing ReFx user to invite.' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    type: [String],
    description: 'Granular per-server permissions to grant.',
    example: ['control.console', 'file.read', 'backup.create'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions!: string[];
}
