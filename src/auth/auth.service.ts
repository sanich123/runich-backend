import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import * as bcrypt from 'bcrypt';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async signUp(email: string, password: string) {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.prisma.users.create({ data: { email, encrypted_password: hashedPassword } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя:${email}`);
    } else {
      const isPasswordValid = await bcrypt.compare(password, `${user.encrypted_password}`);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Неправильный пароль');
      }
      return {
        id: user.id,
        accessToken: this.jwtService.sign({ userId: user.id }),
      };
    }
  }

  async verifyToken(accessToken: string) {
    try {
      const tokenInfo = await this.jwtService.verify(accessToken);
      if (!tokenInfo?.userId) {
        throw new UnauthorizedException('Информация о пользователе не была найдена');
      }
      const user = await this.prisma.users.findUnique({ where: { id: tokenInfo?.userId } });
      if (!user) throw new NotFoundException('Пользователь не был найден');

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
}
