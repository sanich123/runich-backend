import { ApiProperty } from '@nestjs/swagger';

export class StatisticMetricResponseDto {
  @ApiProperty({ type: Number })
  totalDuration: number;

  @ApiProperty({ type: Number })
  totalDistance: number;

  @ApiProperty({ type: Number })
  totalItems: number;
}

export class MonthActivityResponseDto {
  @ApiProperty({ type: Number })
  duration: number;

  @ApiProperty({ type: Number })
  distance: number;

  @ApiProperty({ type: Number })
  speed: number;

  @ApiProperty({ type: String, format: 'date-time' })
  date: Date | string;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String })
  sport: string;
}

export class MonthStatisticsResponseDto {
  @ApiProperty({ type: [MonthActivityResponseDto] })
  activities: MonthActivityResponseDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: {
      type: 'object',
      properties: {
        totalDuration: { type: 'number' },
        totalDistance: { type: 'number' },
        totalItems: { type: 'number' },
      },
    },
  })
  activitiesReducedBySport: Record<string, StatisticMetricResponseDto>;
}
