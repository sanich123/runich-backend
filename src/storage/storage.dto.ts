import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';
import { MEDIA_UPLOAD_ROLES, MEDIA_UPLOAD_SCOPES, type MediaUploadScope } from './type';

export class PhotoUploadOptionsDto {
  @ApiProperty({ enum: MEDIA_UPLOAD_SCOPES, required: false, default: 'activity' })
  @IsOptional()
  @IsIn(MEDIA_UPLOAD_SCOPES)
  scope?: MediaUploadScope;

  @ApiProperty({ type: String, format: 'uuid', required: false, description: 'Required for feedback uploads' })
  @IsOptional()
  @IsUUID()
  feedbackId?: string;
}

export class PhotoUploadResponseDto {
  @ApiProperty({ type: String, format: 'uri' })
  url: string;

  @ApiProperty({ type: String, description: 'S3 object key' })
  key: string;

  @ApiProperty({ type: String, description: 'Uploaded file MIME type' })
  contentType: string;
}

export class PhotoUploadBatchDto extends PhotoUploadOptionsDto {
  @ApiProperty({
    type: String,
    description: 'JSON-массив manifest в том же порядке, что и multipart files',
  })
  @IsString()
  @IsNotEmpty()
  manifest: string;
}

export class PhotoUploadBatchResponseDto extends PhotoUploadResponseDto {
  @ApiProperty({ type: String, description: 'Client media identifier' })
  mediaId: string;

  @ApiProperty({ enum: MEDIA_UPLOAD_ROLES })
  role: (typeof MEDIA_UPLOAD_ROLES)[number];
}

export class DeletePhotoDto {
  @ApiProperty({ type: String, format: 'uri', description: 'Public URL returned by the upload endpoint' })
  @IsUrl({ require_protocol: true })
  @IsString()
  @IsNotEmpty()
  url: string;
}
