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
      console.log('this code executed');
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.prisma.users.create({ data: { email, encrypted_password: hashedPassword } });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.users.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException(`No user found for email: ${email}`);
    }
    const isPasswordValid = await bcrypt.compare(password, user.encrypted_password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }
    return {
      id: user.id,
      accessToken: this.jwtService.sign({ userId: user.id, email }),
    };
  }
}
