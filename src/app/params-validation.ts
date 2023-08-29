import { IsUUID } from 'class-validator';

export class ParamsId {
  @IsUUID()
  id: string;
}
