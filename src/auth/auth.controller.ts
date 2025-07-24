import {
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AccessTokenDto, ConfirmationCodeDto, RegisterUserDto } from './auth.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthEntity } from './auth.entity';
import { PrismaService } from 'nestjs-prisma';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private prismaService: PrismaService,
  ) {}

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
  @ApiOkResponse({ type: AuthEntity })
  async login(@Body() { email, password }: RegisterUserDto) {
    return this.authService.login(email, password);
  }

  @Post('verify')
  async verifyTokenAndAppVersion(@Body() { accessToken }: AccessTokenDto) {
    return this.authService.verifyToken(accessToken);
  }

  @Post('confirm-email')
  async confirmEmailByCode(@Body() { confirmationCode, email }: ConfirmationCodeDto) {
    // console.log(confirmationCode, email);
    return this.authService.confirmEmailByCode(confirmationCode, email);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Delete(':userId')
  async deleteUser(@Param() { userId }: { userId: string }) {
    return this.authService.deleteUser(userId);
  }
}
