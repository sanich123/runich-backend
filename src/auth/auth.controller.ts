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
  Patch,
  UseGuards,
  Query,
  Res,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
  SessionLocationDto,
} from './auth.dto';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppConfigEntity, AuthEntity, LoginEntity, MessageEntity } from './auth.entity';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserIdParamsDto } from './auth.params.dto';
import type { AuthenticatedRequest } from './auth-request';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';

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

  @Get('yandex')
  startYandexAuth(@Res() response: Response) {
    return this.authService.startYandexAuth(response);
  }

  @Get('yandex/callback')
  async yandexCallback(@Query('code') code: string, @Query('error') error: string, @Res() response: Response) {
    return this.authService.handleYandexCallback(code, error, response);
  }

  @Get('vk')
  startVkAuth(@Res() response: Response) {
    return this.authService.startVkAuth(response);
  }

  @Get('vk/callback')
  vkCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('device_id') deviceId: string,
    @Res() response: Response,
  ) {
    return this.authService.handleVkCallback(code, state, error, response, deviceId);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  @RateLimit(RATE_LIMITS.authAttempt.limit, RATE_LIMITS.authAttempt.ttl)
  @ApiBody({ type: RegisterUserDto })
  @ApiOkResponse({ type: MessageEntity })
  @ApiCreatedResponse({ type: MessageEntity })
  async registerUser(@Body() { email, password }: RegisterUserDto) {
    const user = await this.prismaService.users.findUnique({ where: { email } });
    if (user?.email_confirmed_at) {
      if (user.auth_provider === 'YANDEX' || user.auth_provider === 'VK') {
        const providerName = user.auth_provider === 'VK' ? 'VK' : 'Яндекс';
        throw new ConflictException(`Пользователь зарегистрирован с помощью провайдера ${providerName}`);
      }
      throw new ConflictException('Под этим адресом почты уже зарегистрирован пользователь');
    }
    return this.authService.signUp(email, password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @RateLimit(RATE_LIMITS.authAttempt.limit, RATE_LIMITS.authAttempt.ttl)
  @ApiBody({ type: RegisterUserDto })
  @ApiOkResponse({ type: LoginEntity })
  async login(@Body() { email, password }: RegisterUserDto, @Req() request?: Request) {
    return request
      ? this.authService.login(email, password, this.getSessionMetadata(request))
      : this.authService.login(email, password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('by-email-link')
  @RateLimit(RATE_LIMITS.emailCode.limit, RATE_LIMITS.emailCode.ttl)
  @ApiBody({ type: EmailLoginLinkDto })
  @ApiOkResponse({ type: MessageEntity })
  async sendLoginLinkByEmail(@Body() { email }: EmailLoginLinkDto) {
    return this.authService.sendLoginLinkByEmail(email);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: AuthEntity })
  async refresh(@Body() { refreshToken }: RefreshTokenDto, @Req() request?: Request) {
    return request
      ? this.authService.refreshAccessToken(refreshToken, this.getSessionMetadata(request))
      : this.authService.refreshAccessToken(refreshToken);
  }

  @Patch('session/location')
  @UseGuards(JwtAuthGuard)
  async updateSessionLocation(
    @Req() request: Request & { user?: { sessionId?: string } },
    @Body() body: SessionLocationDto,
  ) {
    const sessionId = request.user?.sessionId;
    if (sessionId && body.latitude !== undefined && body.longitude !== undefined) {
      await this.prismaService.userSession.update({
        where: { id: sessionId },
        data: { last_latitude: body.latitude, last_longitude: body.longitude, last_location_at: new Date() },
      });
    }
    return { updated: Boolean(sessionId) };
  }

  private getSessionMetadata(request?: Request) {
    return {
      deviceId: request?.header('x-device-id'),
      deviceName: request?.header('x-device-name'),
      platform: request?.header('x-platform'),
      model: request?.header('x-device-model'),
      manufacturer: request?.header('x-device-manufacturer'),
      osName: request?.header('x-device-os-name'),
      osVersion: request?.header('x-device-os-version'),
      deviceType: request?.header('x-device-type'),
      appVersion: request?.header('x-app-version'),
      appBuild: request?.header('x-app-build'),
      userAgent: request?.header('user-agent'),
      ipAddress: request?.ip,
    };
  }

  @Post('verify')
  @ApiBody({ type: AccessTokenDto })
  @ApiOkResponse({ type: LoginEntity })
  @ApiCreatedResponse({ type: LoginEntity })
  async verifyTokenAndAppVersion(@Body() { accessToken, code }: AccessTokenDto, @Req() request?: Request) {
    return this.authService.verifyToken(accessToken, code, request ? this.getSessionMetadata(request) : undefined);
  }

  @Post('confirm-email')
  @RateLimit(RATE_LIMITS.emailCode.limit, RATE_LIMITS.emailCode.ttl)
  @ApiBody({ type: ConfirmationCodeDto })
  @ApiOkResponse({ type: LoginEntity })
  @ApiCreatedResponse({ type: LoginEntity })
  async confirmEmailByCode(@Body() { confirmationCode, email }: ConfirmationCodeDto) {
    return this.authService.confirmEmailByCode(confirmationCode, email);
  }

  @Post('get-email-code-for-password')
  @RateLimit(RATE_LIMITS.emailCode.limit, RATE_LIMITS.emailCode.ttl)
  @ApiBody({ type: GetEmailCodeForPasswordDto })
  @ApiOkResponse({ type: MessageEntity })
  @ApiCreatedResponse({ type: MessageEntity })
  async getEmailCodeForPassword(@Body() { email }: GetEmailCodeForPasswordDto) {
    return this.authService.getEmailCodeForPassword(email);
  }

  @Post('verify-password-change-code')
  @RateLimit(RATE_LIMITS.passwordChange.limit, RATE_LIMITS.passwordChange.ttl)
  @ApiBody({ type: PasswordChangeCodeDto })
  @ApiOkResponse({ type: MessageEntity })
  @ApiCreatedResponse({ type: MessageEntity })
  async verifyPasswordChangeCode(@Body() { confirmationCode, email }: PasswordChangeCodeDto) {
    return this.authService.verifyPasswordChangeCode(confirmationCode, email);
  }

  @Post('change-password')
  @RateLimit(RATE_LIMITS.passwordChange.limit, RATE_LIMITS.passwordChange.ttl)
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
  async deleteUser(@Param() { userId }: UserIdParamsDto, @Req() request?: AuthenticatedRequest) {
    if (!request) return this.authService.deleteUser(userId);
    const currentUserId = request.user.userId ?? request.user.id;
    if (userId !== currentUserId) throw new ConflictException('Недостаточно прав');
    return this.authService.deleteUser(currentUserId);
  }
}
