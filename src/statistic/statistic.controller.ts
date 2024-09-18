import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParamsId } from 'src/app/params-validation';
import { PATHS } from 'src/utils/const';
import { StatisticService } from './statistic.service';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticController {
  constructor(private readonly statisticsService: StatisticService) {}

  @Get(`${PATHS.id}/year-category`)
  @ApiOperation({ summary: 'Gets all statistics by year and by months' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getYearStatisticByYearAndCategory(@Param() { id }: ParamsId) {
    return await this.statisticsService.getStatisticByYearAndCategory(id);
  }

  @Get(`${PATHS.id}/year-month?`)
  @ApiOperation({ summary: 'Gets statistics about activities by year, month, category' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getMonthStatistics(@Query('year') year: string, @Query('month') month: string, @Param() { id }: ParamsId) {
    return await this.statisticsService.getMonthStatisticsByYearMonth(id, year, month);
  }

  @Get(`${PATHS.id}/week?`)
  @ApiOperation({ summary: 'Gets all statistics by current week' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getCurrentWeekStatistics(
    @Query('firstDay') firstDay: string,
    @Query('lastDay') lastDay: string,
    @Param() { id }: ParamsId,
  ) {
    return this.statisticsService.getCurrentWeekStatistics(id, firstDay, lastDay);
  }

  @Get(`${PATHS.id}/all`)
  @ApiOperation({ summary: 'Gets all statistics by userId' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllTimeStatistics(@Param() { id }: ParamsId) {
    return this.statisticsService.getAllActivitiesStatisticsByUserId(id);
  }
}
