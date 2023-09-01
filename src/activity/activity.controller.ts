import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityDto } from './activity.dto';
import { ParamsId } from 'src/app/params-validation';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  async getAll() {
    return 'Здесь будут все активности';
  }

  @Post(':id')
  @HttpCode(HttpStatus.CREATED)
  async createActivity(@Body() activity: ActivityDto, @Param() { id }: ParamsId) {
    console.log(`Activity from frontend`, activity);
    return await this.activityService.createActivity(activity, id);
  }

  @Get(':id')
  async getActivityByUserId(@Param() { id }: ParamsId) {
    return await this.activityService.getActivitesByUserId(id);
  }
}
