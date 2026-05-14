import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import AppError from './app-error.js';
import env from '../config/env.js';

const globalForPrisma = globalThis;

const connectionString = env.databaseUrl;

if (!connectionString) {
  throw new AppError('DATABASE_URL is not configured.', 500);
}

const adapter = new PrismaPg({ connectionString });

const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;