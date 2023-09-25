import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
import { AccountService } from './account.service';
import { ParamsId } from 'src/app/params-validation';
import { ApiResponse, ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { PATHS } from 'src/utils/const';

@ApiTags(PATHS.profile)
@Controller(PATHS.profile)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  @ApiOperation({ summary: 'Gets all profiles' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllAccounts() {
    return await this.accountService.getAllAccounts();
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
