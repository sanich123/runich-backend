import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { handleServiceError } from 'src/common/utils/prisma-errors';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from 'src/email/email.service';
import { getRandomInt } from 'src/common/utils/utils';
import { accessTokenExpiresIn, emailAccessTokenExpiresIn, refreshTokenExpiresIn } from './jwt.constants';
import type { Response } from 'express';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(JwtService)
    private jwtService: JwtService,
    @Inject(EmailService)
    private emailService: EmailService,
  ) {}

  startYandexAuth(response: Response) {
    const clientId = process.env.YANDEX_CLIENT_ID;
    const redirectUri = process.env.YANDEX_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new ServiceUnavailableException('Авторизация через Яндекс не настроена');
    }
    const url = new URL('https://oauth.yandex.ru/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('force_confirm', 'yes');
    return response.redirect(url.toString());
  }

  async handleYandexCallback(code: string, error: string, response: Response) {
    const frontendUrl = process.env.YANDEX_FRONTEND_REDIRECT_URI ?? 'https://runich.netlify.app/sign-in';
    if (error || !code)
      return response.redirect(`${frontendUrl}?oauthError=${encodeURIComponent(error || 'missing_code')}`);

    const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.YANDEX_CLIENT_ID ?? '',
        client_secret: process.env.YANDEX_CLIENT_SECRET ?? '',
      }),
    });
    if (!tokenResponse.ok) throw new UnauthorizedException('Не удалось получить токен Яндекс');
    const { access_token: yandexAccessToken } = (await tokenResponse.json()) as { access_token?: string };
    if (!yandexAccessToken) throw new UnauthorizedException('Яндекс не вернул access token');

    const userResponse = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${yandexAccessToken}` },
    });
    if (!userResponse.ok) throw new UnauthorizedException('Не удалось получить данные пользователя Яндекс');
    const yandexUser = (await userResponse.json()) as {
      id?: string;
      default_email?: string;
      login?: string;
      first_name?: string;
      last_name?: string;
      real_name?: string;
      city?: string;
      default_avatar_id?: string;
    };
    const email = yandexUser.default_email ?? (yandexUser.login ? `${yandexUser.login}@yandex.ru` : undefined);
    if (!email) throw new UnauthorizedException('Яндекс не вернул email пользователя');

    let user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) {
      const profileData = {
        name: yandexUser.first_name ?? yandexUser.real_name?.split(' ')[0],
        surname: yandexUser.last_name,
        city: yandexUser.city,
        profilePhoto: yandexUser.default_avatar_id
          ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200`
          : undefined,
        email,
      };
      user = await this.prisma.users.create({
        data: {
          email,
          auth_provider: 'YANDEX',
          email_confirmed_at: new Date(),
          created_at: new Date(),
          profile: { create: profileData },
        },
      });
    } else if (!user.email_confirmed_at) {
      user = await this.prisma.users.update({ where: { id: user.id }, data: { email_confirmed_at: new Date() } });
    }
    await this.prisma.users.update({ where: { id: user.id }, data: { last_sign_in_at: new Date() } });
    const accessToken = this.jwtService.sign({ userId: user.id }, { expiresIn: accessTokenExpiresIn });
    const redirect = new URL(frontendUrl);
    redirect.searchParams.set('accessToken', accessToken);
    return response.redirect(redirect.toString());
  }

  async signUp(email: string, password: string) {
    try {
      const user = await this.prisma.users.findUnique({ where: { email } });

      if (user && !user?.email_confirmed_at) {
        const accessToken = this.jwtService.sign({ userId: user.id }, { expiresIn: emailAccessTokenExpiresIn });
        const confirmationCode = getRandomInt(1, 100000);
        await this.sendConfirmationCode(email, confirmationCode, accessToken);
        return await this.prisma.users.update({
          where: { email },
          data: { confirmation_sent_at: new Date(), confirmation_token: `${confirmationCode}` },
        });
      } else {
        const hashedPassword = await bcrypt.hash(password, 10);
        const confirmationCode = getRandomInt(1, 100000);

        const user = await this.prisma.users.create({
          data: {
            email,
            encrypted_password: hashedPassword,
            confirmation_token: `${confirmationCode}`,
            confirmation_sent_at: new Date(),
            created_at: new Date(),
            profile: { create: {} },
          },
        });
        const accessToken = this.jwtService.sign({ userId: user.id }, { expiresIn: emailAccessTokenExpiresIn });
        await this.sendConfirmationCode(email, confirmationCode, accessToken);
        return { message: 'Код подтверждения был выслан на Вашу электронную почту' };
      }
    } catch (error) {
      handleServiceError(error);
    }
  }

  private async sendConfirmationCode(email: string, confirmationCode: number, accessToken: string) {
    try {
      await this.emailService.sendConfirmationCode(email, confirmationCode, accessToken);
    } catch (error) {
      this.logger.error(`Не удалось отправить письмо с кодом подтверждения на ${email}`, error);
      throw new ServiceUnavailableException('Сервис отправки электронной почты временно недоступен');
    }
  }

  async login(email: string, password: string) {
    try {
      const user = await this.prisma.users.findUnique({ where: { email } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      } else {
        if (user.auth_provider === 'YANDEX') {
          throw new UnauthorizedException(
            'Вы зарегистрированы без пароля с помощью Яндекса. Авторизуйтесь через Яндекс',
          );
        }
        const isPasswordValid = await bcrypt.compare(password, `${user.encrypted_password}`);
        if (!isPasswordValid) {
          throw new UnauthorizedException('Неправильный пароль');
        }
        if (!user.email_confirmed_at) {
          this.logger.warn(`Вход отклонён: учётная запись не подтверждена (${email})`);
          throw new UnauthorizedException('Данная учетная запись не подтверждена');
        }
        await this.prisma.users.update({ where: { id: user.id }, data: { last_sign_in_at: new Date() } });
        return {
          userId: user.id,
          accessToken: this.jwtService.sign({ userId: user.id }, { expiresIn: accessTokenExpiresIn }),
          refreshToken: this.jwtService.sign({ userId: user.id }, { expiresIn: refreshTokenExpiresIn }),
        };
      }
    } catch (error) {
      handleServiceError(error);
    }
  }

  async sendLoginLinkByEmail(email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }

      const accessToken = this.jwtService.sign({ userId: user.id }, { expiresIn: emailAccessTokenExpiresIn });
      await this.emailService.sendLoginLink(normalizedEmail, accessToken);

      return { message: 'Ссылка для входа в Runich отправлена на указанную почту' };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async verifyToken(accessToken: string) {
    try {
      const tokenInfo = await this.jwtService.verify(accessToken);
      if (!tokenInfo?.userId) {
        throw new UnauthorizedException('Информация о пользователе не была найдена');
      }
      const user = await this.prisma.users.findUnique({ where: { id: tokenInfo?.userId } });
      if (!user) {
        throw new NotFoundException('Пользователь не был найден');
      }
      if (!user?.email_confirmed_at) {
        await this.prisma.users.update({ where: { id: user.id }, data: { email_confirmed_at: new Date() } });
      }

      return {
        userId: user.id,
        accessToken: this.jwtService.sign({ userId: user.id }, { expiresIn: accessTokenExpiresIn }),
        refreshToken: this.jwtService.sign({ userId: user.id }, { expiresIn: refreshTokenExpiresIn }),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Срок действия токена истёк');
      }
      handleServiceError(error);
    }
  }

  async refreshAccessToken(refreshToken: string) {
    try {
      const tokenInfo = this.jwtService.verify<{ userId?: string }>(refreshToken);
      if (typeof tokenInfo?.userId !== 'string' || !tokenInfo.userId) {
        throw new UnauthorizedException('Информация о пользователе не была найдена');
      }

      return {
        accessToken: this.jwtService.sign({ userId: tokenInfo.userId }, { expiresIn: accessTokenExpiresIn }),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Недействительный refresh token');
    }
  }

  async deleteUser(userId: string) {
    try {
      const deletedUser = await this.prisma.$transaction(
        async (transaction) => {
          await transaction.friend.deleteMany({
            where: {
              OR: [{ user_id: userId }, { friendId: userId }],
            },
          });
          return transaction.users.delete({ where: { id: userId } });
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
      return deletedUser;
    } catch (error) {
      handleServiceError(error);
    }
  }

  async confirmEmailByCode(confirmationCode: string, email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (confirmationCode !== user?.confirmation_token) {
        throw new BadRequestException('Код подтверждения не соответствует высланному');
      } else {
        await this.prisma.users.update({ where: { email: normalizedEmail }, data: { email_confirmed_at: new Date() } });
        return {
          userId: user.id,
          accessToken: this.jwtService.sign({ userId: user.id }, { expiresIn: accessTokenExpiresIn }),
          refreshToken: this.jwtService.sign({ userId: user.id }, { expiresIn: refreshTokenExpiresIn }),
        };
      }
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getEmailCodeForPassword(email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }

      const recoveryCode = getRandomInt(100000, 999999);
      await this.emailService.sendPasswordChangeCode(normalizedEmail, recoveryCode);
      await this.prisma.users.update({
        where: { id: user.id },
        data: {
          recovery_token: `${recoveryCode}`,
          recovery_sent_at: new Date(),
        },
      });

      return { message: 'Код для смены email был выслан на указанную почту' };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async verifyPasswordChangeCode(confirmationCode: string, email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (confirmationCode !== user.recovery_token) {
        throw new BadRequestException('Код для смены пароля не соответствует высланному');
      }

      await this.prisma.users.update({
        where: { id: user.id },
        data: { recovery_token: null },
      });

      return { message: 'Код для смены пароля подтверждён' };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async changePassword(password1: string, password2: string, email: string) {
    try {
      if (password1 !== password2) {
        throw new BadRequestException('Пароли не совпадают');
      }
      if (password1.length < 8 || !/[A-Z]/.test(password1) || !/\d/.test(password1)) {
        throw new BadRequestException('Пароль должен содержать минимум 8 символов, одну заглавную букву и одну цифру');
      }

      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (user.recovery_token !== null || !user.recovery_sent_at) {
        throw new BadRequestException('Сначала подтвердите код для смены пароля');
      }

      const encryptedPassword = await bcrypt.hash(password1, 10);
      await this.prisma.users.update({
        where: { id: user.id },
        data: {
          encrypted_password: encryptedPassword,
          recovery_token: null,
          recovery_sent_at: null,
        },
      });

      return {
        accessToken: this.jwtService.sign({ userId: user.id }, { expiresIn: accessTokenExpiresIn }),
        refreshToken: this.jwtService.sign({ userId: user.id }, { expiresIn: refreshTokenExpiresIn }),
        userId: user.id,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }
}
