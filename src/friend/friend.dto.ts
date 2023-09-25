import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class FriendDto {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ description: 'Identifer of who add a friend', required: true, nullable: false, type: String })
  userId: string;
}
