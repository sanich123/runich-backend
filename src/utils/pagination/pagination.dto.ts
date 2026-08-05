import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';

export class PaginationResponseDto<T> {
  @ApiProperty({ type: Number, example: 35 })
  totalItems: number;

  @ApiProperty({ type: Number, example: 0 })
  page: number;

  @ApiProperty({ type: Number, example: 10 })
  size: number;

  @ApiHideProperty()
  items: T[];
}
