import { Controller, Get, HttpStatus, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParamsId } from 'src/common/dto/params-validation';
import { PATHS, QueryParams } from 'src/common/constants';
import { StatisticService } from './statistic.service';
import { MonthStatisticsResponseDto, StatisticMetricResponseDto } from './statistic.response.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@ApiTags(PATHS.statistics)
@ApiBearerAuth('bearerAuth')
@Controller(PATHS.statistics)
export class StatisticController {
  constructor(@Inject(StatisticService) private readonly statisticsService: StatisticService) {}

  @Get(`${PATHS.id}/year-category`)
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        isUserHasActivities: { type: 'boolean' },
      },
      additionalProperties: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              totalDuration: { type: 'number' },
              totalDistance: { type: 'number' },
              totalItems: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets all statistics by year and categories with months statistics' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getYearStatisticByYearAndCategory(@Param() { id }: ParamsId) {
    return await this.statisticsService.getStatisticByYearAndCategory(id);
  }

  @Get(`${PATHS.id}/year-month`)
  @ApiOkResponse({ type: MonthStatisticsResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets statistics about activities by year, month, category' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiQuery({ name: QueryParams.year, required: false, description: 'Year' })
  @ApiQuery({ name: QueryParams.month, required: false, description: 'Month' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getMonthStatistics(
    @Query(QueryParams.year) year: string,
    @Query(QueryParams.month) month: string,
    @Param() { id }: ParamsId,
  ) {
    return await this.statisticsService.getMonthStatisticsByYearMonth(id, year, month);
  }

  @Get(`${PATHS.id}/week`)
  @ApiOkResponse({ type: StatisticMetricResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets all statistics by current week' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiQuery({ name: QueryParams.firstDay, required: false, description: 'First day of the week' })
  @ApiQuery({ name: QueryParams.lastDay, required: false, description: 'Last day of the week' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getCurrentWeekStatistics(
    @Query(QueryParams.firstDay) firstDay: string,
    @Query(QueryParams.lastDay) lastDay: string,
    @Param() { id }: ParamsId,
  ) {
    return this.statisticsService.getCurrentWeekStatistics(id, firstDay, lastDay);
  }

  @Get(`${PATHS.id}/all`)
  @ApiOkResponse({ type: StatisticMetricResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets all statistics by userId' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllTimeStatistics(@Param() { id }: ParamsId) {
    return this.statisticsService.getAllActivitiesStatisticsByUserId(id);
  }
}
