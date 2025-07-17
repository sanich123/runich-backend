import { Body, ConflictException, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './auth.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthEntity } from './auth.entity';
import { PrismaService } from 'nestjs-prisma';

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
    if (user) throw new ConflictException('Под этим адресом почты уже зарегистрирован пользователь');
    return this.authService.signUp(email, password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOkResponse({ type: AuthEntity })
  login(@Body() { email, password }: RegisterUserDto) {
    return this.authService.login(email, password);
  }
}
