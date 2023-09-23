import { Controller, Get, Param } from '@nestjs/common';
import { AccountService } from './account.service';
import { ParamsId } from 'src/app/params-validation';

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
}
