import { PartialType } from '@nestjs/swagger';
import { CreateCannedResponseDto } from './create-canned-response.dto';

/** Staff payload to edit a canned response (all fields optional). */
export class UpdateCannedResponseDto extends PartialType(CreateCannedResponseDto) {}
