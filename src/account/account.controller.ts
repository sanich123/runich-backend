import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AccountService } from './account.service';
import { ParamsId } from 'src/common/dto/params-validation';
import { ApiResponse, ApiTags, ApiOperation, ApiParam, ApiQuery, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { PATHS } from 'src/common/constants';
import { ProfileDto } from './account.dto';
import { type Pagination, PaginationParams } from 'src/common/decorators/pagination.decorator';
import { PaginationResponseDto } from 'src/common/dto/pagination.dto';
import { type Filtering, FilteringParams } from './filter.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@ApiTags(PATHS.profile)
@Controller(PATHS.profile)
@ApiExtraModels(PaginationResponseDto)
export class AccountController {
  constructor(@Inject(AccountService) private readonly accountService: AccountService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets all profiles' })
  @ApiParam({ name: 'page', required: false, description: 'Page Number' })
  @ApiParam({ name: 'size', required: false, description: 'Count of results per page' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Success',
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginationResponseDto) },
        {
          properties: {
            items: { type: 'array', items: { $ref: getSchemaPath(ProfileDto) } },
          },
        },
      ],
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllAccounts(@Query() paginationParams: Pagination) {
    return await this.accountService.getAllAccounts(paginationParams);
  }

  @Get('/filter')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Search profiles by different fields' })
  @ApiQuery({ name: 'page', required: false, description: 'Page Number' })
  @ApiQuery({ name: 'size', required: false, description: 'Count of results per page' })
  @ApiQuery({ name: 'name', required: false, description: 'Search by name, surname or email' })
  @ApiQuery({
    name: 'surname',
    required: false,
    description: 'Search by name, surname or email',
  })
  @ApiQuery({ name: 'email', required: false, description: 'Search by name, surname or email' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Success',
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginationResponseDto) },
        {
          properties: {
            items: { type: 'array', items: { $ref: getSchemaPath(ProfileDto) } },
          },
        },
      ],
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getFilteredAccounts(
    @PaginationParams() paginationParams: Pagination,
    @FilteringParams(['name', 'email', 'surname']) filter?: Filtering,
  ) {
    if (filter) {
      return await this.accountService.getFilteredAccounts(paginationParams, filter);
    }
  }

  @Patch(PATHS.id)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async updateProfileInfo(@Body() profile: ProfileDto, @Param() { id }: ParamsId) {
    return await this.accountService.updateProfileInfo(profile, id);
  }

  @Get(PATHS.id)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user profile by id' })
  @ApiParam({ name: 'userId', required: true, description: 'User identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAccountByUserId(@Param() { id }: ParamsId) {
    return await this.accountService.getAccountByUserId(id);
  }
}
