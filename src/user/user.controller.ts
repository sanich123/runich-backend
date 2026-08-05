import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ParamsId } from 'src/common/dto/params-validation';
import { UserService } from './user.service';
import { UserDto } from './user.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('/user')
export class UserController {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  async getAllUsers() {
    return await this.userService.getAllUsers();
  }

  @Get(':id/profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getProfileByUserId(@Param() { id }: ParamsId) {
    return await this.userService.getProfileByUserId(id);
  }

  @Post(':id/profile')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Create user profile' })
  @ApiBody({ type: UserDto })
  @HttpCode(HttpStatus.CREATED)
  async createProfileByUserId(@Param() { id }: ParamsId, @Body() accountDto: UserDto) {
    return await this.userService.createProfileByUserId(id, accountDto);
  }

  @Patch(':id/profile')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Update user profile' })
  @ApiBody({ type: UserDto })
  @HttpCode(HttpStatus.OK)
  async updateProfileByProfileId(@Param() { id }: ParamsId, @Body() accountDto: UserDto) {
    return await this.userService.updateProfileByProfileId(id, accountDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Delete user account' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUserByUserId(@Param() { id }: ParamsId) {
    return await this.userService.deleteUserByUserId(id);
  }
}
