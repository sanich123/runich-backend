import {
  Body,
  BadRequestException,
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
import { AuthService } from '../services/auth.service';
import {
  LoginCodeDto,
  ChangePasswordDto,
  ConfirmationCodeDto,
  EmailLoginLinkDto,
  GetEmailCodeForPasswordDto,
  PasswordChangeCodeDto,
  RefreshTokenDto,
  RegisterUserDto,
  SessionLocationDto,
  AppConfigResponseDto,
  AuthResponseDto,
  LoginResponseDto,
  MessageResponseDto,
  UserIdParamsDto,
} from '../dto/auth.dto';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../request/auth-request';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { isRussianEmailAddress, normalizeEmail, RUSSIAN_EMAIL_REGISTRATION_ERROR } from '../utils/russian-email';

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
  @ApiOkResponse({ type: AppConfigResponseDto })
  getConfig() {
    return { appVersion: '1.0.0' };
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
    @Query('error') error: string | undefined,
    @Query('device_id') deviceId: string,
    @Res() response: Response,
  ) {
    return this.authService.handleVkCallback(code, state, error, response, deviceId);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  @RateLimit(RATE_LIMITS.authAttempt.limit, RATE_LIMITS.authAttempt.ttl)
  @ApiBody({ type: RegisterUserDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async registerUser(@Body() { email, password }: RegisterUserDto) {
    const normalizedEmail = normalizeEmail(email);
    if (!isRussianEmailAddress(normalizedEmail)) {
      throw new BadRequestException(RUSSIAN_EMAIL_REGISTRATION_ERROR);
    }

    const user = await this.prismaService.user.findUnique({
      where: { email: normalizedEmail },
      select: { emailConfirmedAt: true, authProvider: true },
    });
    if (user?.emailConfirmedAt) {
      if (user.authProvider === 'YANDEX' || user.authProvider === 'VK') {
        const providerName = user.authProvider === 'VK' ? 'VK' : 'Яндекс';
        throw new ConflictException(`Пользователь зарегистрирован с помощью провайдера ${providerName}`);
      }
      throw new ConflictException('Под этим адресом почты уже зарегистрирован пользователь');
    }
    return this.authService.signUp(normalizedEmail, password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @RateLimit(RATE_LIMITS.authAttempt.limit, RATE_LIMITS.authAttempt.ttl)
  @ApiBody({ type: RegisterUserDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(@Body() { email, password }: RegisterUserDto, @Req() request?: Request) {
    const normalizedEmail = normalizeEmail(email);
    return request
      ? this.authService.login(normalizedEmail, password, this.getSessionMetadata(request))
      : this.authService.login(normalizedEmail, password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('by-email-link')
  @RateLimit(RATE_LIMITS.emailCode.limit, RATE_LIMITS.emailCode.ttl)
  @ApiBody({ type: EmailLoginLinkDto })
  @ApiOkResponse({ type: MessageResponseDto })
  async sendLoginLinkByEmail(@Body() { email }: EmailLoginLinkDto) {
    return this.authService.sendLoginLinkByEmail(email);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(@Body() { refreshToken }: RefreshTokenDto, @Req() request?: Request) {
    return request
      ? this.authService.refreshAccessToken(refreshToken, this.getSessionMetadata(request))
      : this.authService.refreshAccessToken(refreshToken);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiResponse({ status: HttpStatus.NO_CONTENT, schema: { type: 'null' }, description: 'No response body' })
  async logout(@Req() request: AuthenticatedRequest) {
    await this.authService.logout(request.user.id, request.user.sessionId);
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
        data: { lastLatitude: body.latitude, lastLongitude: body.longitude, lastLocationAt: new Date() },
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
  @ApiBody({ type: LoginCodeDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiCreatedResponse({ type: LoginResponseDto })
  async verifyTokenAndAppVersion(@Body() { code }: LoginCodeDto, @Req() request?: Request) {
    return this.authService.verifyToken(code, request ? this.getSessionMetadata(request) : undefined);
  }

  @Post('confirm-email')
  @RateLimit(RATE_LIMITS.emailCode.limit, RATE_LIMITS.emailCode.ttl)
  @ApiBody({ type: ConfirmationCodeDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiCreatedResponse({ type: LoginResponseDto })
  async confirmEmailByCode(@Body() { confirmationCode, email }: ConfirmationCodeDto) {
    return this.authService.confirmEmailByCode(confirmationCode, email);
  }

  @Post('get-email-code-for-password')
  @RateLimit(RATE_LIMITS.emailCode.limit, RATE_LIMITS.emailCode.ttl)
  @ApiBody({ type: GetEmailCodeForPasswordDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async getEmailCodeForPassword(@Body() { email }: GetEmailCodeForPasswordDto) {
    return this.authService.getEmailCodeForPassword(email);
  }

  @Post('verify-password-change-code')
  @RateLimit(RATE_LIMITS.passwordChange.limit, RATE_LIMITS.passwordChange.ttl)
  @ApiBody({ type: PasswordChangeCodeDto })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async verifyPasswordChangeCode(@Body() { confirmationCode, email }: PasswordChangeCodeDto) {
    return this.authService.verifyPasswordChangeCode(confirmationCode, email);
  }

  @Post('change-password')
  @RateLimit(RATE_LIMITS.passwordChange.limit, RATE_LIMITS.passwordChange.ttl)
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiCreatedResponse({ type: LoginResponseDto })
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
