import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import * as bcrypt from 'bcrypt';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from 'src/email/email.service';
import { getRandomInt } from 'src/utils/utils';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwtService: JwtService,
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
          console.log('account unconfirmed');
          throw new UnauthorizedException('Данная учетная запись не подтверждена');
        }
        await this.prisma.users.update({ where: { id: user.id }, data: { last_sign_in_at: new Date() } });
        return {
          id: user.id,
          accessToken: this.jwtService.sign({ userId: user.id }),
        };
      }
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async loginWithGoogle(email: string, name?: string, photo?: string) {
    try {
      const user = await this.prisma.users.findUnique({ where: { email } });

      if (!user) {
        const user = await this.prisma.users.create({
          data: {
            email,
            email_confirmed_at: new Date(),
            created_at: new Date(),
          },
        });
        if (user.id) {
          await this.prisma.profile.create({
            data: { email, name: name ?? '', profilePhoto: photo ?? '', created_at: new Date(), user_id: user.id },
          });
          return {
            id: user.id,
            accessToken: this.jwtService.sign({ userId: user.id }),
          };
        }
      } else {
        const userProfile = await this.prisma.profile.findUnique({ where: { user_id: user.id } });
        if (userProfile) {
          if (!userProfile?.profilePhoto && photo) {
            await this.prisma.profile.update({
              where: { user_id: user.id },
              data: { profilePhoto: photo, updatedAt: new Date() },
            });
          }
          if (!userProfile?.name && name) {
            await this.prisma.profile.update({ where: { user_id: user.id }, data: { name, updatedAt: new Date() } });
          }
        } else {
          await this.prisma.profile.create({
            data: {
              email,
              name: name ?? '',
              surname: '',
              profilePhoto: photo ?? '',
              created_at: new Date(),
              user_id: user.id,
            },
          });
        }
        return {
          id: user.id,
          accessToken: this.jwtService.sign({ userId: user.id }),
        };
      }
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
        appVersion: '3.0.0',
        id: user.id,
        accessToken: this.jwtService.sign({ userId: user.id }),
      };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async deleteUser(userId: string) {
    try {
      return await this.prisma.users.delete({ where: { id: userId } });
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
          appVersion: '3.0.0',
          id: user.id,
          accessToken: this.jwtService.sign({ userId: user.id }),
        };
      }
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async authInFromEmailLink(email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (!user?.email_confirmed_at) {
        throw new NotFoundException('Данный email не подтвержден. Зарегистрируйтесь и подтвердите email');
      }
      const accessToken = this.jwtService.sign({ userId: user.id });
      await this.emailService.sendResetPasswordLink(email, accessToken);
      return { message: 'Код подтверждения был выслан на Вашу электронную почту' };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
