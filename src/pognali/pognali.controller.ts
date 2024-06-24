import { Body, Controller, Get, Post } from '@nestjs/common';
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
  async getAllCards() {
    return await this.pognaliService.getAllCards();
  }
}
