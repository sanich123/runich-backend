import { Controller, Get, HttpStatus, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParamsId } from 'src/common/dto/params-validation';
import { PATHS, QueryParams } from 'src/common/constants';
import { StatisticService } from './statistic.service';
import { MonthStatisticsResponseDto, StatisticMetricResponseDto } from './statistic.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { validateOptionalDateQuery, validateOptionalIntegerQuery } from 'src/common/utils/query-validation';

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
    @Param() { id }: ParamsId,
    @Query(QueryParams.year) year?: string,
    @Query(QueryParams.month) month?: string,
  ) {
    const validatedYear = validateOptionalIntegerQuery(year, QueryParams.year, { min: 0 });
    const validatedMonth = validateOptionalIntegerQuery(month, QueryParams.month, { min: 0, max: 11 });
    return await this.statisticsService.getMonthStatisticsByYearMonth(id, validatedYear, validatedMonth);
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
    @Param() { id }: ParamsId,
    @Query(QueryParams.firstDay) firstDay?: string,
    @Query(QueryParams.lastDay) lastDay?: string,
  ) {
    const validatedFirstDay = validateOptionalDateQuery(firstDay, QueryParams.firstDay);
    const validatedLastDay = validateOptionalDateQuery(lastDay, QueryParams.lastDay);
    return this.statisticsService.getCurrentWeekStatistics(id, validatedFirstDay, validatedLastDay);
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
