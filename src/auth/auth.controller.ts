import { Controller, HttpCode, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { HttpStatus } from '@nestjs/common';
import { CreateUserDto } from 'src/user/user.dto';
import { Public } from './public';
import { CreateRefreshTokenDto } from './auth.dto';

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('/signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() { login, password }: CreateUserDto) {
    return await this.authService.signUp(login, password);
  }

  @Public()
  @Post('/signin')
  async logIn(@Body() { login, password }: CreateUserDto) {
    return await this.authService.logIn(login, password);
  }

  @Public()
  @Post('refresh')
  async refreshTokens(@Body() { refreshToken }: CreateRefreshTokenDto) {
    return await this.authService.validateToken(refreshToken);
  }
}
