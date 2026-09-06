import { IsNotEmpty, IsUUID } from 'class-validator';

export class UserIdParamsDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;
}
