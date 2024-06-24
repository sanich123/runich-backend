import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { TravelInfo } from './pognali.dto';
import { prismaErrorHandling } from 'src/utils/prisma-errors';

@Injectable()
export class PognaliService {
  constructor(private readonly prisma: PrismaService) {}

  async createTripInfo(body: TravelInfo) {
    try {
      return await this.prisma.tripItem.create({
        data: body,
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }

  async getAllCards() {
    try {
      return await this.prisma.tripItem.findMany({
        orderBy: { date: 'desc' },
      });
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
