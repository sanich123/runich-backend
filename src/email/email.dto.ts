import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

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
  @IsNotEmpty()
  @ApiProperty({ title: 'Author photo', nullable: false, required: true, type: String })
  profilePhoto: string;

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
  @IsNotEmpty()
  @ApiProperty({ title: 'Author comment', nullable: false, required: true, type: String })
  mapPhotoUrl: string;
}

export class CommentLikeEmailDTO extends EmailDTO {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ title: 'Author comment', nullable: false, required: true, type: String })
  comment: string;
}

export class CommentEmailDTO extends CommentLikeEmailDTO {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ title: 'Author comment', nullable: false, required: true, type: String })
  mapPhotoUrl: string;
}
