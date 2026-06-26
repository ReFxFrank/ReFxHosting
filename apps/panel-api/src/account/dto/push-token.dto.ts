import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

/** Register a device for push. The iOS app posts its APNs token here. */
export class RegisterPushTokenDto {
  @ApiProperty({ description: 'APNs device token (hex) / FCM registration token.' })
  @IsString()
  @MaxLength(400)
  token!: string;

  @ApiProperty({ enum: ['ios', 'android'], default: 'ios' })
  @IsIn(['ios', 'android'])
  platform!: string;
}
