import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class PhotoUploadResponseDto {
  @ApiProperty({ type: String, format: 'uri' })
  url: string;

  @ApiProperty({ type: String, description: 'S3 object key' })
  key: string;

  @ApiProperty({ type: String, description: 'Uploaded file MIME type' })
  contentType: string;
}

export class DeletePhotoDto {
  @ApiProperty({ type: String, format: 'uri', description: 'Public URL returned by the upload endpoint' })
  @IsUrl({ require_protocol: true })
  @IsString()
  @IsNotEmpty()
  url: string;
}
