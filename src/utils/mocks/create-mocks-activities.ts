import { PrismaClient } from '@prisma/client';
import { getIds } from './getIds';
import {
  BEKELE_ACTIVITY,
  DAUWALTER_ACTIVITY,
  FARAH_ACTIVITY,
  HAILE_ACTIVITY,
  JORNET_ACTIVITY,
  KIPCHOGE_ACTIVITY,
  KISELEV_ACTIVITY,
  MITYAEV_ACTIVITY,
  WALMSLEY_ACTIVITY,
} from './activities';
const prisma = new PrismaClient();

const {
  dauwalterActivityId,
  kipchogeActivityId,
  jimWalmsleyActivityId,
  stepanKiselevActivityId,
  dmitryMityaevActivityId,
  jornetActivityId,
  farahActivityId,
  haileActivityId,
  bekeleActivityId,
} = getIds();

export async function createDauwalterActivity(id: string) {
  return await prisma.activity.upsert({
    where: { id: dauwalterActivityId },
    update: {},
    create: {
      userId: id,
      ...DAUWALTER_ACTIVITY,
    },
  });
}

export async function createKipchogeActivity(id: string) {
  return await prisma.activity.upsert({
    where: { id: kipchogeActivityId },
    update: {},
    create: {
      userId: id,
      ...KIPCHOGE_ACTIVITY,
    },
  });
}

export async function createWalmsleyActivity(id: string) {
  return await prisma.activity.upsert({
    where: { id: jimWalmsleyActivityId },
    update: {},
    create: {
      userId: id,
      ...WALMSLEY_ACTIVITY,
    },
  });
}

export async function createKiselevActivity(id: string) {
  return await prisma.activity.upsert({
    where: { id: stepanKiselevActivityId },
    update: {},
    create: {
      userId: id,
      ...KISELEV_ACTIVITY,
    },
  });
}

export async function createMityaevActivity(id: string) {
  return await prisma.activity.upsert({
    where: { id: dmitryMityaevActivityId },
    update: {},
    create: {
      userId: id,
      ...MITYAEV_ACTIVITY,
    },
  });
}

export async function createJornetActivity(id: string) {
  return await prisma.activity.upsert({
    where: { id: jornetActivityId },
    update: {},
    create: {
      userId: id,
      ...JORNET_ACTIVITY,
    },
  });
}

export async function createFarahActivity(id: string) {
  return await prisma.activity.upsert({
    where: { id: farahActivityId },
    update: {},
    create: {
      userId: id,
      ...FARAH_ACTIVITY,
    },
  });
}

export async function createHaileActivity(id: string) {
  return await prisma.activity.upsert({
    where: { id: haileActivityId },
    update: {},
    create: {
      userId: id,
      ...HAILE_ACTIVITY,
    },
  });
}

export async function createBekeleActivity(id: string) {
  return await prisma.activity.upsert({
    where: { id: bekeleActivityId },
    update: {},
    create: {
      userId: id,
      ...BEKELE_ACTIVITY,
    },
  });
}
