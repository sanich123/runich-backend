import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { AccountService } from './account.service';
import { ApiBearerAuth, ApiResponse, ApiTags, ApiOperation, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import { PATHS, QueryParams } from 'src/common/constants';
import { ProfilePaginationResponseDto } from './account.dto';
import { type Filtering, FilteringParams } from './filter.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
import { parseProfileCursor } from './account.pagination';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';

@ApiTags(PATHS.profile)
@ApiBearerAuth('bearerAuth')
@Controller(PATHS.profile)
export class AccountController {
  constructor(@Inject(AccountService) private readonly accountService: AccountService) {}

  @Get('/filter')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Search profiles by different fields' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor from the previous response' })
  @ApiQuery({ name: 'take', required: false, description: 'Count of results per page' })
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
    @Query(QueryParams.cursor) cursor: string | undefined,
    @Query(QueryParams.take) take: string | undefined,
    @FilteringParams(['name', 'email', 'surname']) filter: Filtering,
    @Req() request?: AuthenticatedRequest,
  ) {
    const args = [
      validateOptionalIntegerQuery(take, QueryParams.take, { min: 1, max: 100 }),
      parseProfileCursor(cursor),
      filter,
    ] as const;
    const currentUserId = request?.user.userId ?? request?.user.id;
    return currentUserId
      ? await this.accountService.getFilteredAccounts(...args, currentUserId)
      : await this.accountService.getFilteredAccounts(...args);
  }
}
