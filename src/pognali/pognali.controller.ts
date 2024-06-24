import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PognaliService } from './pognali.service';
import { TravelInfo } from './pognali.dto';

@Controller('pognali')
export class PognaliController {
  constructor(private readonly pognaliService: PognaliService) {}

  @Post()
  async postTravelInfo(@Body() body: TravelInfo) {
    return await this.pognaliService.createTripInfo(body);
  }

  @Get()
  async getFilteredCards(
    @Query('country') country: string,
    @Query('regions') regions: string[],
    @Query('page') page: string,
    @Query('take') take: string,
  ) {
    return await this.pognaliService.getFilteredCards({
      country,
      regions: typeof regions === 'string' ? [regions] : regions,
      page,
      take,
    });
  }
}
