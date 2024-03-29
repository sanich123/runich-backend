import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { AccountService } from './account.service';
import { ParamsId } from 'src/app/params-validation';
import { ApiResponse, ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { PATHS } from 'src/utils/const';
import { ProfileDto } from './account.dto';
import { Pagination, PaginationParams } from 'src/utils/pagination/pagination.decorator';
import { PaginatedResource } from 'src/utils/pagination/pagination.dto';
import { Filtering, FilteringParams } from './filter.decorator';

@ApiTags(PATHS.profile)
@Controller(PATHS.profile)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  @ApiOperation({ summary: 'Gets all profiles' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllAccounts(@PaginationParams() paginationParams: Pagination): Promise<PaginatedResource<Partial<ProfileDto>>> {
    return await this.accountService.getAllAccounts(paginationParams);
  }

  @Get('/filter')
  @ApiOperation({ summary: 'Gets all profiles' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getFilteredAccounts(
    @PaginationParams() paginationParams: Pagination,
    @FilteringParams(['name', 'email', 'city', 'gender', 'sport', 'surname']) filter?: Filtering
  ): Promise<PaginatedResource<Partial<ProfileDto>>> {
    return await this.accountService.getFilteredAccounts(paginationParams, filter);
  }

  @Patch(PATHS.id)
  @HttpCode(HttpStatus.CREATED)
  async updateProfileInfo(@Body() profile: ProfileDto, @Param() { id }: ParamsId) {
    return await this.accountService.updateProfileInfo(profile, id);
  }

  @Get(PATHS.id)
  @ApiOperation({ summary: 'Get user profile by id' })
  @ApiParam({ name: 'userId', required: true, description: 'User identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAccountByUserId(@Param() { id }: ParamsId) {
    return await this.accountService.getAccountByUserId(id);
  }
}
