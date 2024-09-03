import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

@Injectable()
export class StatisticService {
  constructor(private readonly prisma: PrismaService) {}
}
