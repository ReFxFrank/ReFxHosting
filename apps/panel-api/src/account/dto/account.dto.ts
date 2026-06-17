import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../auth/password.validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    minLength: 10,
    description: '10–128 chars with a lowercase, uppercase, number and symbol',
  })
  @IsStrongPassword()
  newPassword!: string;
}

export class TotpEnableDto {
  @ApiProperty({ description: 'Current TOTP code from the authenticator app' })
  @IsString()
  code!: string;
}

/**
 * Upload an avatar as a base64 data URL (the browser downscales the image first
 * so it stays small). Capped at ~110 KB of binary (≈150 KB base64).
 */
export class SetAvatarDto {
  @ApiProperty({ description: 'data:image/{png|jpeg|webp|gif};base64,… data URL' })
  @IsString()
  @MaxLength(150_000, { message: 'Image is too large — keep it under ~100 KB' })
  @Matches(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, {
    message: 'Avatar must be a PNG, JPEG, WebP or GIF image',
  })
  dataUrl!: string;
}
