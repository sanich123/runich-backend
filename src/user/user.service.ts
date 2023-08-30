import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './user.dto';
import { getTimeStampFromTime } from 'src/utils/utils';
import { prismaErrorHandling } from 'src/utils/prisma-errors';
import { hash } from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany();
  }

  async findOne(id: string) {
    try {
      return this.prisma.user.findUnique({
        where: { id },
        include: {
          profile: true,
          activity: true,
        },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async createUser(createUserDto: CreateUserDto) {
    try {
      const { id, updatedAt, createdAt, login, version, email } = await this.prisma.user.create({
        data: createUserDto,
      });
      const tsCreatedAt = getTimeStampFromTime(createdAt);
      const tsUpdatedAt = getTimeStampFromTime(updatedAt);
      return { id, updatedAt: tsCreatedAt, createdAt: tsUpdatedAt, login, version, email };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async deleteUser(id: string) {
    try {
      return await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async updatePassword(newPassword: string, paramsId: string) {
    try {
      const { login, version, createdAt, updatedAt, id } = await this.prisma.user.update({
        where: { id: paramsId },
        data: { password: newPassword, version: { increment: 1 } },
      });
      const tsCreatedAt = getTimeStampFromTime(createdAt);
      const tsUpdatedAt = getTimeStampFromTime(updatedAt);
      return { login, version, createdAt: tsCreatedAt, updatedAt: tsUpdatedAt, id };
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async findOneByLogin(login: string) {
    try {
      return this.prisma.user.findUnique({ where: { login } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
  async updateRefreshToken(id: string, refreshToken: string) {
    try {
      const hashedRefreshToken = await hash(refreshToken, +process.env.CRYPT_SALT);
      return await this.prisma.user.update({ where: { id }, data: { hashedRefreshToken, version: { increment: 1 } } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
