/**
 * Admin Seed Script
 * -----------------
 * Creates (or upserts) an ADMIN user with a pre-hashed password.
 * The account is marked as email-verified so the admin can log in immediately.
 *
 * Usage:
 *   node prisma/seed.js
 *
 * You can customise credentials via env vars before running:
 *   SEED_ADMIN_EMAIL=admin@example.com
 *   SEED_ADMIN_PASSWORD=MySecret123!
 *   SEED_ADMIN_FIRST_NAME=Super
 *   SEED_ADMIN_LAST_NAME=Admin
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ── Config ────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('[Seed] ❌  DATABASE_URL is not set. Aborting.');
  process.exit(1);
}

const ADMIN_EMAIL      = process.env.SEED_ADMIN_EMAIL      || 'admin@zephyrtechno.com';
const ADMIN_PASSWORD   = process.env.SEED_ADMIN_PASSWORD   || 'Admin@1234';
const ADMIN_FIRST_NAME = process.env.SEED_ADMIN_FIRST_NAME || 'Super';
const ADMIN_LAST_NAME  = process.env.SEED_ADMIN_LAST_NAME  || 'Admin';

// ── Prisma client (same adapter setup as the rest of the app) ─
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

// ── Seed ──────────────────────────────────────────────────────
async function seed() {
  console.log('[Seed] Starting admin seed…');

  if (ADMIN_PASSWORD.length < 8) {
    console.error('[Seed] ❌  SEED_ADMIN_PASSWORD must be at least 8 characters. Aborting.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      // Re-apply every run so the password stays in sync if changed
      firstName:       ADMIN_FIRST_NAME,
      lastName:        ADMIN_LAST_NAME,
      passwordHash,
      role:            'ADMIN',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      // Clear any stale OTP data
      emailVerificationOtpHash:      null,
      emailVerificationOtpExpiresAt: null,
      passwordResetOtpHash:          null,
      passwordResetOtpExpiresAt:     null,
      passwordResetOtpVerifiedAt:    null,
    },
    create: {
      email:           ADMIN_EMAIL,
      firstName:       ADMIN_FIRST_NAME,
      lastName:        ADMIN_LAST_NAME,
      passwordHash,
      role:            'ADMIN',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
    select: {
      id:              true,
      email:           true,
      firstName:       true,
      lastName:        true,
      role:            true,
      isEmailVerified: true,
    },
  });

  console.log('[Seed] ✅  Admin user seeded successfully:');
  console.table({
    id:              admin.id,
    email:           admin.email,
    name:            `${admin.firstName} ${admin.lastName}`,
    role:            admin.role,
    emailVerified:   admin.isEmailVerified,
  });

  console.log(`\n[Seed] 🔑  Login credentials:`);
  console.log(`         Email    : ${ADMIN_EMAIL}`);
  console.log(`         Password : ${ADMIN_PASSWORD}`);
}

seed()
  .catch((err) => {
    console.error('[Seed] ❌  Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
