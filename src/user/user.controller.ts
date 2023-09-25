import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ParamsId } from 'src/app/params-validation';
import { UserService } from './user.service';
import { ProfileDto } from 'src/account/account.dto';

@Controller('/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  async getAllUsers() {
    return await this.userService.getAllUsers();
  }

  @Post(':id/profile')
  @ApiCreatedResponse({ description: 'Upsert user profile' })
  @ApiBody({ type: ProfileDto })
  @HttpCode(HttpStatus.CREATED)
  async upsertAccountByUserId(@Param() { id }: ParamsId, @Body() accountDto: ProfileDto) {
    return await this.userService.upsertAccountByUserId(id, accountDto);
  }
}
