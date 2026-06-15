import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  newPassword!: string;
}

export class TotpEnableDto {
  @ApiProperty({ description: 'Current TOTP code from the authenticator app' })
  @IsString()
  code!: string;
}
