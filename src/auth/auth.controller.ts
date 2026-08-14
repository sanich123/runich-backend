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
import {
  AccessTokenDto,
  ChangePasswordDto,
  ConfirmationCodeDto,
  EmailLoginLinkDto,
  GetEmailCodeForPasswordDto,
  PasswordChangeCodeDto,
  RefreshTokenDto,
  RegisterUserDto,
} from './auth.dto';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppConfigEntity, AuthEntity, LoginEntity, MessageEntity } from './auth.entity';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserIdParamsDto } from './auth.params.dto';

@ApiTags('auth')
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
    return { appVersion: '4.0.0' };
  }

  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  @ApiBody({ type: RegisterUserDto })
  @ApiOkResponse({ type: MessageEntity })
  @ApiCreatedResponse({ type: MessageEntity })
  async registerUser(@Body() { email, password }: RegisterUserDto) {
    const user = await this.prismaService.users.findUnique({ where: { email } });
    if (user?.email_confirmed_at) {
      throw new ConflictException('Под этим адресом почты уже зарегистрирован пользователь');
    }
    return this.authService.signUp(email, password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiBody({ type: RegisterUserDto })
  @ApiOkResponse({ type: LoginEntity })
  async login(@Body() { email, password }: RegisterUserDto) {
    return this.authService.login(email, password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('by-email-link')
  @ApiBody({ type: EmailLoginLinkDto })
  @ApiOkResponse({ type: MessageEntity })
  async sendLoginLinkByEmail(@Body() { email }: EmailLoginLinkDto) {
    return this.authService.sendLoginLinkByEmail(email);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: AuthEntity })
  async refresh(@Body() { refreshToken }: RefreshTokenDto) {
    return this.authService.refreshAccessToken(refreshToken);
  }

  @Post('verify')
  @ApiBody({ type: AccessTokenDto })
  @ApiOkResponse({ type: LoginEntity })
  @ApiCreatedResponse({ type: LoginEntity })
  async verifyTokenAndAppVersion(@Body() { accessToken }: AccessTokenDto) {
    return this.authService.verifyToken(accessToken);
  }

  @Post('confirm-email')
  @ApiBody({ type: ConfirmationCodeDto })
  @ApiOkResponse({ type: LoginEntity })
  @ApiCreatedResponse({ type: LoginEntity })
  async confirmEmailByCode(@Body() { confirmationCode, email }: ConfirmationCodeDto) {
    return this.authService.confirmEmailByCode(confirmationCode, email);
  }

  @Post('get-email-code-for-password')
  @ApiBody({ type: GetEmailCodeForPasswordDto })
  @ApiOkResponse({ type: MessageEntity })
  @ApiCreatedResponse({ type: MessageEntity })
  async getEmailCodeForPassword(@Body() { email }: GetEmailCodeForPasswordDto) {
    return this.authService.getEmailCodeForPassword(email);
  }

  @Post('verify-password-change-code')
  @ApiBody({ type: PasswordChangeCodeDto })
  @ApiOkResponse({ type: MessageEntity })
  @ApiCreatedResponse({ type: MessageEntity })
  async verifyPasswordChangeCode(@Body() { confirmationCode, email }: PasswordChangeCodeDto) {
    return this.authService.verifyPasswordChangeCode(confirmationCode, email);
  }

  @Post('change-password')
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ type: LoginEntity })
  @ApiCreatedResponse({ type: LoginEntity })
  async changePassword(@Body() { password1, password2, email }: ChangePasswordDto) {
    return this.authService.changePassword(password1, password2, email);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @Delete(':userId')
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, schema: { type: 'null' }, description: 'No response body' })
  async deleteUser(@Param() { userId }: UserIdParamsDto) {
    return this.authService.deleteUser(userId);
  }
}
