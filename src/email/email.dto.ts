import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

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

  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ title: 'Activity identificator', nullable: false, required: true })
  activityId: string;
}
