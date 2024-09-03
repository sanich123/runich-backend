import { IsNotEmpty, IsUUID } from 'class-validator';

export class ParamsId {
  @IsUUID()
  @IsNotEmpty()
  id: string;
}

export class MultipleParams {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsNotEmpty()
  year: string;

  @IsNotEmpty()
  month: string;

  @IsNotEmpty()
  category: string;
}
