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

  async getFilteredCards({
    country,
    regions,
    page,
    take,
  }: {
    country: string;
    regions: string[];
    page: string;
    take: string;
  }) {
    try {
      if (!country && !regions) {
        return await this.prisma.tripItem.findMany({
          orderBy: { date: 'desc' },
        });
      } else if (country) {
        return await this.prisma.tripItem.findMany({
          orderBy: { date: 'desc' },
          where: {
            countryNames: {
              has: `${country}`,
            },
          },
        });
      } else {
        const tripItemsByRegion = await Promise.all(
          [...regions].map(async (region: string) => {
            return await this.prisma.tripItem.findMany({
              orderBy: { date: 'desc' },
              where: {
                region: { has: region },
              },
            });
          }),
        );
        return tripItemsByRegion.flat();
      }
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
