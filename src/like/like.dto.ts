import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class LikeDto {
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty({ description: 'activity identificator', nullable: false, type: String })
  activityId: string;
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty({ description: 'Author identificator', nullable: false, type: String })
  authorId: string;
}
