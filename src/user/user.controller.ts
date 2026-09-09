import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ParamsId } from 'src/common/dto/params-validation';
import { UserService } from './user.service';
import { UserDto } from './user.dto';
import { ProfileDto } from 'src/account/account.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PATHS } from 'src/common/constants';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';

@ApiTags(PATHS.user)
@ApiBearerAuth('bearerAuth')
@Controller('/user')
export class UserController {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  @Get(':id/profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ProfileDto })
  @ApiOperation({ summary: 'Get a user profile' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  async getProfileByUserId(@Param() { id }: ParamsId) {
    return await this.userService.getProfileByUserId(id);
  }

  @Post(':id/profile')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: ProfileDto })
  @ApiCreatedResponse({ type: ProfileDto, description: 'Create user profile' })
  @ApiBody({ type: UserDto })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @HttpCode(HttpStatus.CREATED)
  async createProfileByUserId(
    @Param() { id }: ParamsId,
    @Body() accountDto: UserDto,
    @Req() request?: AuthenticatedRequest,
  ) {
    return await this.userService.createProfileByUserId(id, request?.user.id ?? id, accountDto);
  }

  @Patch(':id/profile')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: ProfileDto })
  @ApiResponse({ status: HttpStatus.OK, type: ProfileDto, description: 'Update user profile' })
  @ApiBody({ type: UserDto })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @HttpCode(HttpStatus.OK)
  async updateProfileByUserId(
    @Param() { id }: ParamsId,
    @Body() accountDto: UserDto,
    @Req() request?: AuthenticatedRequest,
  ) {
    return await this.userService.updateProfileByUserId(id, request?.user.id ?? id, accountDto);
  }
}
