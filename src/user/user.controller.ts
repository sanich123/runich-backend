import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse } from '@nestjs/swagger';
import { ParamsId } from 'src/app/params-validation';
import { UserService } from './user.service';
import { ProfileDto } from 'src/account/account.dto';

@Controller('/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async getAllUsers() {
    return await this.userService.getAllUsers();
  }

  @Post(':id/profile')
  @ApiCreatedResponse({ description: 'Upsert user profile' })
  @ApiBody({ type: ProfileDto })
  async upsertAccountByUserId(@Param() { id }: ParamsId, @Body() accountDto: ProfileDto) {
    return await this.userService.upsertAccountByUserId(id, accountDto);
  }
}
