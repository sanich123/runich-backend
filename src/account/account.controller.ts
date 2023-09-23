import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AccountService } from './account.service';
import { ParamsId } from 'src/app/params-validation';
import { ProfileDto } from './account.dto';

@Controller('/profile')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  async getAllAccounts() {
    return await this.accountService.getAllAccounts();
  }

  @Get(':id')
  async getAccountByUserId(@Param() { id }: ParamsId) {
    return await this.accountService.getAccountByUserId(id);
  }

  @Post(':id')
  async createAccountByUserId(@Param() { id }: ParamsId, @Body() accountDto: ProfileDto) {
    return await this.accountService.createAccountByUserId(id, accountDto);
  }
}
