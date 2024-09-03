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
  @ApiOperation({ summary: 'Gets all user activities' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getYearsAndTypesOfActivities(@Param() { id }: ParamsId) {
    return await this.activityService.getYearsAndTypesOfActivities(id);
  }

  @Get(`${PATHS.id}/year/:year/:month/:category`)
  @ApiOperation({ summary: 'Gets all user activities' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getYearStatisticWithMonthsByCategory(@Param() { id, year, month, category }: MultipleParams) {
    return await this.activityService.getYearStatisticWithMonthsByCategory(id, year, month, category);
  }
}
