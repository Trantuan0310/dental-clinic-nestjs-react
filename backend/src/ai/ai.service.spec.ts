import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { validPatient, validEncounter } from '../../test/helpers/fixtures';
import { NotFoundException } from '@nestjs/common';

describe('AiService', () => {
  let service: AiService;
  let prisma: PrismaMockShape;
  let cache: jest.Mocked<RedisCacheService>;

  const basePatient = validPatient({
    id: 'pat-1',
    allergies: ['Penicillin'],
    chronicDiseases: ['Hypertension'],
    currentMedications: ['Amlodipine'],
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = {
      getJSON: jest.fn(),
      setJSON: jest.fn(),
      del: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(false),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisCacheService, useValue: cache },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  describe('getPatientSummary', () => {
    it('throws NotFoundException when patient not found', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getPatientSummary('missing', 3, false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns cached summary when available', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      const cachedSummary = {
        patientId: 'pat-1',
        generatedAt: new Date().toISOString(),
        source: 'fallback' as const,
        bullets: [],
        asOf: { encounterCount: 0 },
        cached: false,
      };
      (cache.getJSON as jest.Mock).mockResolvedValue(cachedSummary);

      const result = await service.getPatientSummary('pat-1', 3, false);

      expect(result.cached).toBe(true);
      expect(prisma.encounter.findMany).not.toHaveBeenCalled();
    });

    it('skips cache when refresh=true', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue({ cached: true });
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getPatientSummary('pat-1', 3, true);

      expect(cache.getJSON).not.toHaveBeenCalled();
      expect(result.cached).toBe(false);
      expect(result.source).toBe('fallback');
    });

    it('produces rule-based summary when Gemini is not configured', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue(null);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(1);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(2);

      const result = await service.getPatientSummary('pat-1', 3, false);

      expect(result.source).toBe('fallback');
      expect(result.model).toBeUndefined();
      expect(result.bullets.length).toBeGreaterThan(0);
      const allergyBullet = result.bullets.find(b => b.id === 'allergy');
      expect(allergyBullet).toBeDefined();
      expect(allergyBullet?.text).toContain('Penicillin');
      const openBullet = result.bullets.find(b => b.id === 'open');
      expect(openBullet?.text).toContain('1 phiên khám');
      expect(openBullet?.text).toContain('2 hóa đơn');
    });

    it('includes "next visit" bullet from latest encounter treatment plan', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue(null);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([
        {
          ...validEncounter({ id: 'enc-1', patientId: 'pat-1' }),
          chiefComplaint: 'Toothache',
          diagnosis: 'Caries',
          treatmentPlanText: 'Root canal next week',
          treatments: [],
        },
      ]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getPatientSummary('pat-1', 3, false);

      const nextBullet = result.bullets.find(b => b.id === 'next');
      expect(nextBullet).toBeDefined();
      expect(nextBullet?.text).toContain('Root canal next week');
      expect(result.asOf.lastVisitAt).toBeDefined();
    });

    it('uses fallback text from diagnosis when no treatment plan', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue(null);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([
        {
          ...validEncounter({ id: 'enc-1', patientId: 'pat-1' }),
          chiefComplaint: 'Pain',
          diagnosis: 'Caries grade 2',
          treatmentPlanText: null,
          treatments: [],
        },
      ]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getPatientSummary('pat-1', 3, false);

      const nextBullet = result.bullets.find(b => b.id === 'next');
      expect(nextBullet?.text).toContain('Caries grade 2');
    });
  });
});
