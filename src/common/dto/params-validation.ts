import { IsNotEmpty, IsUUID } from 'class-validator';

export class ParamsId {
  @IsUUID()
  @IsNotEmpty()
  id: string;
}
