import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class EmailDTO {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ title: 'Author name', nullable: false, required: true, type: String })
  name: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ title: 'Author surname', nullable: false, required: true, type: String })
  surname: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @ApiProperty({ title: 'Author photo', nullable: true, required: false, type: String })
  profilePhoto?: string;

  @IsString()
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty({ title: 'Activity identifier', format: 'uuid', nullable: false, required: true, type: String })
  activityId: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ title: 'Name of receiver email', nullable: false, required: true, type: String })
  recepientName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ title: 'Surname of receiver email', nullable: false, required: true, type: String })
  recepientSurname: string;

  @IsNotEmpty()
  @IsString()
  @IsEmail()
  @ApiProperty({ title: 'Email of receiver', nullable: false, required: true, type: String })
  recepientEmail: string;
}

export class LikeEmailDTO extends EmailDTO {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @ApiProperty({ title: 'Activity map', nullable: true, required: false, type: String })
  mapPhotoUrl?: string;
}

export class CommentLikeEmailDTO extends EmailDTO {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ title: 'Author comment', nullable: false, required: true, type: String })
  comment: string;
}

export class CommentEmailDTO extends CommentLikeEmailDTO {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @ApiProperty({ title: 'Activity map', nullable: true, required: false, type: String })
  mapPhotoUrl?: string;
}
