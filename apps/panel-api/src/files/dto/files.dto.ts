import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class PathQueryDto {
  @ApiPropertyOptional({ default: '/' })
  @IsOptional()
  @IsString()
  path = '/';
}

export class WriteFileDto {
  @ApiProperty()
  @IsString()
  path!: string;

  @ApiProperty()
  @IsString()
  content!: string;
}

export class DeleteFilesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  paths!: string[];
}

export class RenameFileDto {
  @ApiProperty()
  @IsString()
  from!: string;

  @ApiProperty()
  @IsString()
  to!: string;
}

export class MkdirDto {
  @ApiProperty()
  @IsString()
  path!: string;
}

export class ChmodDto {
  @ApiProperty({ description: 'Octal mode string, e.g. "0644"' })
  @IsString()
  mode!: string;

  @ApiProperty()
  @IsString()
  path!: string;
}

export class CompressDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  paths!: string[];

  @ApiPropertyOptional({ description: 'Destination archive path' })
  @IsOptional()
  @IsString()
  destination?: string;
}

export class DecompressDto {
  @ApiProperty()
  @IsString()
  path!: string;
}

export class UploadUrlDto {
  @ApiProperty({ description: 'Target directory for the upload' })
  @IsString()
  path!: string;
}
