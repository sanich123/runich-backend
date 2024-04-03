import { ApiProperty } from '@nestjs/swagger';

export class PaginationResponseDto<T> {

    @ApiProperty({ example: 35 })
    totalItems: number;

    @ApiProperty({ example: 0 })
    page: number;

    @ApiProperty({ example: 10 })
    size: number;

    items: T[];
};
