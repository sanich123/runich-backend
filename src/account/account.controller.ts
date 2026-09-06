import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AccountService } from './account.service';
import {
  ApiBearerAuth,
  ApiResponse,
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiExtraModels,
  ApiOkResponse,
} from '@nestjs/swagger';
import { PATHS } from 'src/common/constants';
import { ProfilePaginationResponseDto } from './account.dto';
import { type Pagination, PaginationParams } from 'src/common/decorators/pagination.decorator';
import { PaginationResponseDto } from 'src/common/dto/pagination.dto';
import { type Filtering, FilteringParams } from './filter.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@ApiTags(PATHS.profile)
@ApiBearerAuth('bearerAuth')
@Controller(PATHS.profile)
@ApiExtraModels(PaginationResponseDto)
export class AccountController {
  constructor(@Inject(AccountService) private readonly accountService: AccountService) {}

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
  @ApiOkResponse({ type: ProfilePaginationResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async getFilteredAccounts(
    @PaginationParams() paginationParams: Pagination,
    @FilteringParams(['name', 'email', 'surname']) filter: Filtering,
  ) {
    return await this.accountService.getFilteredAccounts(paginationParams, filter);
  }
}
