import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const assertSsl = (service: PrismaService) =>
    (service as unknown as { assertProductionDatabaseSsl: () => void }).assertProductionDatabaseSsl();

  it('does not throw outside production regardless of DATABASE_URL', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const service = new PrismaService();
    expect(() => assertSsl(service)).not.toThrow();
  });

  it('throws in production when DATABASE_URL has no sslmode', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@db.example.com:5432/db';
    const service = new PrismaService();
    expect(() => assertSsl(service)).toThrow(/sslmode/i);
  });

  it('throws in production when sslmode=prefer (silently downgrades)', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@db.example.com:5432/db?sslmode=prefer';
    const service = new PrismaService();
    expect(() => assertSsl(service)).toThrow(/sslmode/i);
  });

  it('throws in production when sslmode=disable', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@db.example.com:5432/db?sslmode=disable';
    const service = new PrismaService();
    expect(() => assertSsl(service)).toThrow(/sslmode/i);
  });

  it.each(['require', 'verify-ca', 'verify-full'])(
    'does not throw in production when sslmode=%s',
    mode => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = `postgresql://user:pass@db.example.com:5432/db?sslmode=${mode}`;
      const service = new PrismaService();
      expect(() => assertSsl(service)).not.toThrow();
    },
  );

  it('is case-insensitive on sslmode value', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@db.example.com:5432/db?sslmode=REQUIRE';
    const service = new PrismaService();
    expect(() => assertSsl(service)).not.toThrow();
  });
});
