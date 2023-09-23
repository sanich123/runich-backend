import { IsUUID } from 'class-validator';

export class FriendDto {
  @IsUUID()
  userId: string;
}
