import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class EmailDTO {
  @IsString()
  @ApiProperty({ title: 'Author name', nullable: false, required: true })
  name: string;

  @IsString()
  @ApiProperty({ title: 'Author surname', nullable: false, required: true })
  surname: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ title: 'Author photo', nullable: false, required: true })
  profilePhoto: string;

  @IsString()
  @ApiProperty({ title: 'Name of receiver email', nullable: false, required: true })
  recepientName: string;

  @IsString()
  @ApiProperty({ title: 'Surname of receiver email', nullable: false, required: true })
  recepientSurname: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ title: 'Email of receiver', nullable: false, required: true })
  recepientEmail: string;
}

export class LikeEmailDTO extends EmailDTO {
  @IsString()
  @ApiProperty({ title: 'Author comment', nullable: false, required: true })
  mapPhotoUrl: string;
}

export class CommentLikeEmailDTO extends EmailDTO {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ title: 'Author comment', nullable: false, required: true })
  comment: string;
}

export class CommentEmailDTO extends CommentLikeEmailDTO {
  @IsString()
  @ApiProperty({ title: 'Author comment', nullable: false, required: true })
  mapPhotoUrl: string;
}
