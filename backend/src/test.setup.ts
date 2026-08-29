/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

interface NodeJSProcessEnv {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL: string;
  CORS_ORIGIN: string;
  THROTTLE_TTL: string;
  THROTTLE_LIMIT: string;
}

// Ambient declaration for process.env — consumed by other files via TS reference.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const process: { env: NodeJSProcessEnv };

const prisma = new PrismaClient();

export { prisma };
export type { NodeJSProcessEnv };
