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
      if ((!country && !regions) || regions?.length === 5) {
        const length = await this.prisma.tripItem.count();
        const tripItems = await this.prisma.tripItem.findMany({
          orderBy: { date: 'desc' },
          skip: Number(page) * Number(take),
          take: Number(take),
        });
        return { tripItems, length: length };
      } else if (country) {
        console.log(country);
        const length = await this.prisma.tripItem.count({
          where: {
            countryNames: {
              has: `${country}`,
            },
          },
        });
        const tripItems = await this.prisma.tripItem.findMany({
          orderBy: { date: 'desc' },
          skip: Number(page) * Number(take),
          take: Number(take),
          where: {
            countryNames: {
              has: `${country}`,
            },
          },
        });
        return { tripItems, length: length };
      } else {
        if (regions.length > 2) {
          const firstCoupleOfRegions = await Promise.all(
            [...regions.slice(0, 2)].map(async (region: string) => {
              return await this.prisma.tripItem.findMany({
                orderBy: { date: 'desc' },
                where: {
                  region: { has: region },
                },
              });
            }),
          );
          const otherCoupleOfRegions = await Promise.all(
            [...regions.slice(2)].map(async (region: string) => {
              return await this.prisma.tripItem.findMany({
                orderBy: { date: 'desc' },
                where: {
                  region: { has: region },
                },
              });
            }),
          );
          const flattedItems = [...firstCoupleOfRegions, ...otherCoupleOfRegions].flat();

          let result = [];
          for (let i = 0; i < flattedItems.length; i++) {
            let idsCards = Array.from(new Set(flattedItems.map(({ id }) => id)));
            if (idsCards.includes(flattedItems[i].id)) {
              result.push(flattedItems[i]);
              idsCards = idsCards.filter((id) => id !== flattedItems[i].id);
            }
          }
          const from = Number(page) * Number(take);
          return { tripItems: result.slice(from, from + 4), length: result.length };
        } else {
          const filteredRegions = await Promise.all(
            [...regions].map(async (region: string) => {
              return await this.prisma.tripItem.findMany({
                orderBy: { date: 'desc' },
                where: {
                  region: { has: region },
                },
              });
            }),
          );
          const flattedItems = [...filteredRegions].flat();

          let result = [];
          for (let i = 0; i < flattedItems.length; i++) {
            let idsCards = Array.from(new Set(flattedItems.map(({ id }) => id)));
            if (idsCards.includes(flattedItems[i].id)) {
              result.push(flattedItems[i]);
              idsCards = idsCards.filter((id) => id !== flattedItems[i].id);
            }
          }
          const from = Number(page) * Number(take);
          return { tripItems: result.slice(from, from + 4), length: result.length };
        }
      }
    } catch (error) {
      prismaErrorHandling(error);
    }
  }
}
