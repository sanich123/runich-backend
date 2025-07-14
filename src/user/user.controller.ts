import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ParamsId } from 'src/app/params-validation';
import { UserService } from './user.service';
import { ProfileDto } from './user.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  async getAllUsers() {
    return await this.userService.getAllUsers();
  }

  @Get(':id/profile')
  @HttpCode(HttpStatus.OK)
  async getProfileByUserId(@Param() { id }: ParamsId) {
    return await this.userService.getProfileByUserId(id);
  }

  @Post(':id/profile')
  @ApiCreatedResponse({ description: 'Create user profile' })
  @ApiBody({ type: ProfileDto })
  @HttpCode(HttpStatus.CREATED)
  async createProfileByUserId(@Param() { id }: ParamsId, @Body() accountDto: ProfileDto) {
    return await this.userService.createProfileByUserId(id, accountDto);
  }

  @Patch(':id/profile')
  @ApiCreatedResponse({ description: 'Update user profile' })
  @ApiBody({ type: ProfileDto })
  @HttpCode(HttpStatus.OK)
  async updateProfileByProfileId(@Param() { id }: ParamsId, @Body() accountDto: ProfileDto) {
    return await this.userService.updateProfileByProfileId(id, accountDto);
  }

  @Delete(':id')
  @ApiCreatedResponse({ description: 'Delete user account' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUserByUserId(@Param() { id }: ParamsId) {
    return await this.userService.deleteUserByUserId(id);
  }
}
