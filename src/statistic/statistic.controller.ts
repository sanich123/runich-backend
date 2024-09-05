import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ActivityService } from 'src/activity/activity.service';
import { MultipleParams, ParamsId } from 'src/app/params-validation';
import { PATHS } from 'src/utils/const';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticController {
  constructor(private readonly activityService: ActivityService) {}

  @Get(`${PATHS.id}`)
  @ApiOperation({ summary: 'Gets available years and types of activities' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getYearsAndTypesOfActivities(@Param() { id }: ParamsId) {
    return await this.activityService.getYearsAndTypesOfActivities(id);
  }

  @Get(`${PATHS.id}/year-month-category/:year/:month/:category`)
  @ApiOperation({ summary: 'Gets statistics about activities by year, month, category' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getYearStatisticWithMonthsByCategory(@Param() { id, year, month, category }: MultipleParams) {
    return await this.activityService.getYearStatisticWithMonthsByCategory(id, year, month, category);
  }

  @Get(`${PATHS.id}/year-category/:year/:category`)
  @ApiOperation({ summary: 'Gets all statistics by year and by months' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getYearStatisticByYearAndCategory(@Param() { id, year, category }: MultipleParams) {
    return await this.activityService.getStatisticByYearAndCategory(id, year, category);
  }
}
