import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  const query = jest.fn();

  beforeEach(async () => {
    query.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: query } }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('checks the database for readiness', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable when the database fails', async () => {
    query.mockRejectedValue(new Error('connection failed'));
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns status ok with timestamp', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
