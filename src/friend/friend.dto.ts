import { Allow } from 'class-validator';

export class FriendDto {
  @Allow()
  private readonly _?: never;
}
