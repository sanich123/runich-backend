import { Body, Controller, Get, HttpCode, Param, Post, HttpStatus } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ParamsId } from 'src/app/params-validation';
import { ProfileDto } from './profile.dto';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(':id')
  async getProfile(@Param() { id }: ParamsId) {
    return await this.profileService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProfile(@Body() createProfileDto: ProfileDto) {
    return await this.profileService.createProfile(createProfileDto);
  }

  @Get()
  async getAllProfiles() {
    return await this.profileService.getAll();
  }
}
