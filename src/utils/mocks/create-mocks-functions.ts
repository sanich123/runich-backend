import { PrismaClient } from '@prisma/client';
import {
  BEKELE_PROFILE_INFO,
  DAUWALTER_PROFILE_INFO,
  FARAH_PROFILE_INFO,
  HAILE_PROFILE_INFO,
  JORNET_PROFILE_INFO,
  KIPCHOGE_PROFILE_INFO,
  KISELEV_PROFILE_INFO,
  MITYAEV_PROFILE_INFO,
  WALMSLEY_PROFILE_INFO,
} from './profiles-info';
import {
  BEKELE_PROFILE,
  DAUWALTER_PROFILE,
  FARAH_PROFILE,
  HAILE_PROFILE,
  JORNET_PROFILE,
  KIPCHOGE_PROFILE,
  KISELEV_PROFILE,
  MITYAEV_PROFILE,
  WALMSLEY_PROFILE,
} from './profiles';
import { getIds } from './getIds';
import { BEKELE_ACTIVITY, FARAH_ACTIVITY, HAILE_ACTIVITY, JORNET_ACTIVITY, KIPCHOGE_ACTIVITY } from './activities';
const prisma = new PrismaClient();

const {
  courtneyDauwalterId,
  eliudKipchogeId,
  kilianJornetId,
  moFarahId,
  haileGebrselassieId,
  kenenisaBekeleId,
  jimWalmsleyId,
  stepanKiselevId,
  dmitryMityaevId,
} = getIds();

export async function createCourtneyDownwalter() {
  return await prisma.user.upsert({
    where: { id: courtneyDauwalterId },
    update: {},
    create: {
      ...DAUWALTER_PROFILE_INFO,
      profile: { create: DAUWALTER_PROFILE },
    },
  });
}

export async function createEliudKipchoge() {
  return await prisma.user.upsert({
    where: { id: eliudKipchogeId },
    update: {},
    create: {
      ...KIPCHOGE_PROFILE_INFO,
      profile: { create: KIPCHOGE_PROFILE },
      activity: { create: KIPCHOGE_ACTIVITY },
    },
  });
}

export async function createKilianJornet() {
  return await prisma.user.upsert({
    where: { id: kilianJornetId },
    update: {},
    create: {
      ...JORNET_PROFILE_INFO,
      profile: { create: JORNET_PROFILE },
      activity: { create: JORNET_ACTIVITY },
    },
  });
}

export async function createMoFarah() {
  return await prisma.user.upsert({
    where: { id: moFarahId },
    update: {},
    create: {
      ...FARAH_PROFILE_INFO,
      profile: { create: FARAH_PROFILE },
      activity: { create: FARAH_ACTIVITY },
    },
  });
}

export async function createHaileGebreselassie() {
  return await prisma.user.upsert({
    where: { id: haileGebrselassieId },
    update: {},
    create: {
      ...HAILE_PROFILE_INFO,
      profile: { create: HAILE_PROFILE },
      activity: { create: HAILE_ACTIVITY },
    },
  });
}

export async function createKenenisiBekele() {
  return await prisma.user.upsert({
    where: { id: kenenisaBekeleId },
    update: {},
    create: {
      ...BEKELE_PROFILE_INFO,
      profile: { create: BEKELE_PROFILE },
      activity: { create: BEKELE_ACTIVITY },
    },
  });
}

export async function createJimWalmsley() {
  return await prisma.user.upsert({
    where: { id: jimWalmsleyId },
    update: {},
    create: {
      ...WALMSLEY_PROFILE_INFO,
      profile: { create: WALMSLEY_PROFILE },
    },
  });
}

export async function createStepanKiselev() {
  return await prisma.user.upsert({
    where: { id: stepanKiselevId },
    update: {},
    create: {
      ...KISELEV_PROFILE_INFO,
      profile: { create: KISELEV_PROFILE },
    },
  });
}

export async function createDmitryMityaev() {
  return await prisma.user.upsert({
    where: { id: dmitryMityaevId },
    update: {},
    create: {
      ...MITYAEV_PROFILE_INFO,
      profile: { create: MITYAEV_PROFILE },
    },
  });
}
