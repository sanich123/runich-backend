import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { prismaErrorHandling } from 'src/common/utils/prisma-errors';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from 'src/email/email.service';
import { getRandomInt } from 'src/common/utils/utils';
import { accessTokenExpiresIn, refreshTokenExpiresIn } from './jwt.constants';

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

  async signUp(email: string, password: string) {
    try {
      const user = await this.prisma.users.findUnique({ where: { email } });

      if (user && !user?.email_confirmed_at) {
        const accessToken = this.jwtService.sign({ userId: user.id });
        const confirmationCode = getRandomInt(1, 100000);
        await this.emailService.sendConfirmationCode(email, confirmationCode, accessToken);
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
          },
        });
        const accessToken = this.jwtService.sign({ userId: user.id });
        await this.emailService.sendConfirmationCode(email, confirmationCode, accessToken);
        return { message: 'Код подтверждения был выслан на Вашу электронную почту' };
      }
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async login(email: string, password: string) {
    try {
      const user = await this.prisma.users.findUnique({ where: { email } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      } else {
        const isPasswordValid = await bcrypt.compare(password, `${user.encrypted_password}`);
        if (!isPasswordValid) {
          throw new UnauthorizedException('Неправильный пароль');
        }
        if (!user.email_confirmed_at) {
          this.logger.warn(`Login rejected for unconfirmed account ${email}`);
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
      prismaErrorHandling(error);
    }
  }

  async sendLoginLinkByEmail(email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }

      const accessToken = this.jwtService.sign({ userId: user.id }, { expiresIn: accessTokenExpiresIn });
      await this.emailService.sendLoginLink(normalizedEmail, accessToken, user.id);

      return { message: 'Ссылка для входа в Runich отправлена на указанную почту' };
    } catch (error) {
      prismaErrorHandling(error);
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
      prismaErrorHandling(error);
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
      prismaErrorHandling(error);
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
      prismaErrorHandling(error);
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
      prismaErrorHandling(error);
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
      prismaErrorHandling(error);
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
        userId: user.id,
      };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
