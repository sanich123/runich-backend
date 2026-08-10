import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AccessTokenDto, ConfirmationCodeDto, RefreshTokenDto, RegisterUserDto } from './auth.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { AppConfigEntity, AuthEntity, LoginEntity } from './auth.entity';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private authService: AuthService,
    @Inject(PrismaService)
    private prismaService: PrismaService,
  ) {}

  @Get('config')
  @ApiOkResponse({ type: AppConfigEntity })
  getConfig() {
    return { minAppVersion: '4.0.0' };
  }

  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  async registerUser(@Body() { email, password }: RegisterUserDto) {
    const user = await this.prismaService.users.findUnique({ where: { email } });
    if (user?.email_confirmed_at) {
      throw new ConflictException('Под этим адресом почты уже зарегистрирован пользователь');
    }
    return this.authService.signUp(email, password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOkResponse({ type: LoginEntity })
  async login(@Body() { email, password }: RegisterUserDto) {
    return this.authService.login(email, password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOkResponse({ type: AuthEntity })
  async refresh(@Body() { refreshToken }: RefreshTokenDto) {
    return this.authService.refreshAccessToken(refreshToken);
  }

  @Post('verify')
  async verifyTokenAndAppVersion(@Body() { accessToken }: AccessTokenDto) {
    return this.authService.verifyToken(accessToken);
  }

  @Post('confirm-email')
  async confirmEmailByCode(@Body() { confirmationCode, email }: ConfirmationCodeDto) {
    return this.authService.confirmEmailByCode(confirmationCode, email);
  }

  @Post('reset-password')
  async resetPassword(@Body() { email }: { email: string }) {
    return await this.authService.authInFromEmailLink(email);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Delete(':userId')
  async deleteUser(@Param() { userId }: { userId: string }) {
    return this.authService.deleteUser(userId);
  }
}
