import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { validPatient, validEncounter } from '../../test/helpers/fixtures';
import { NotFoundException } from '@nestjs/common';
import { buildUserPrompt } from './prompts/summary-prompt';

describe('AiService', () => {
  const actor = {
    sub: 'admin',
    email: 'admin@example.invalid',
    permissions: ['patient.delete', 'encounter.read.any'],
  };
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

  describe('with an AI gateway configured', () => {
    it('summarises through the gateway and labels the source', async () => {
      const values: Record<string, string> = {
        AI_BASE_URL: 'https://gw.test/v1',
        AI_API_KEY: 'k',
        AI_MODEL: 'gw-model',
        GEMINI_API_KEY: 'also-set',
      };
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: '```json\n{"allergy":"Dị ứng Penicillin","open":"","next":""}\n```',
                },
              },
            ],
          }),
      } as any);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: PrismaService, useValue: prisma },
          { provide: RedisCacheService, useValue: cache },
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => values[k]) } },
        ],
      }).compile();
      const gatewayService = module.get<AiService>(AiService);
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      cache.getJSON.mockResolvedValue(null);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);

      const result = await gatewayService.getPatientSummary('pat-1', 3, true, actor);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://gw.test/v1/chat/completions',
        expect.anything(),
      );
      expect(result.source).toBe('llm');
      expect(result.model).toBe('gw-model');
      expect(result.bullets.map(b => b.id)).toContain('allergy');
      fetchMock.mockRestore();
    });
  });

  describe('getPatientSummary', () => {
    it('throws NotFoundException when patient not found', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getPatientSummary('missing', 3, false, actor)).rejects.toThrow(
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

      const result = await service.getPatientSummary('pat-1', 3, false, actor);

      expect(result.cached).toBe(true);
      expect(prisma.encounter.findMany).not.toHaveBeenCalled();
    });

    it('skips cache when refresh=true', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue({ cached: true });
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getPatientSummary('pat-1', 3, true, actor);

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

      const result = await service.getPatientSummary('pat-1', 3, false, actor);

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
          clinicalNote: {
            chiefComplaint: 'Toothache',
            diagnosis: 'Caries',
            treatmentPlan: 'Root canal next week',
            addendums: [],
          },
          treatments: [],
        },
      ]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getPatientSummary('pat-1', 3, false, actor);

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
          clinicalNote: {
            chiefComplaint: 'Pain',
            diagnosis: 'Caries grade 2',
            treatmentPlan: null,
            addendums: [],
          },
          treatments: [],
        },
      ]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getPatientSummary('pat-1', 3, false, actor);

      const nextBullet = result.bullets.find(b => b.id === 'next');
      expect(nextBullet?.text).toContain('Caries grade 2');
    });

    it('reads the record from ClinicalNote (not the unused encounter columns) and skips cancelled encounters', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue(null);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([
        {
          ...validEncounter({ id: 'enc-1', patientId: 'pat-1' }),
          // Legacy columns are never written; they must be ignored.
          chiefComplaint: null,
          diagnosis: null,
          treatmentPlanText: null,
          clinicalNote: null,
          treatments: [],
        },
      ]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getPatientSummary('pat-1', 3, false, actor);

      const query = (prisma.encounter.findMany as jest.Mock).mock.calls[0][0];
      expect(query.where).toEqual(
        expect.objectContaining({ patientId: 'pat-1', status: { not: 'CANCELLED' } }),
      );
      expect(query.select.clinicalNote.select).toEqual(
        expect.objectContaining({ chiefComplaint: true, diagnosis: true, treatmentPlan: true }),
      );
      expect(query.select).not.toHaveProperty('treatmentPlanText');
      expect(result.bullets.find(b => b.id === 'next')?.text).toContain('Theo dõi chung');
    });
  });

  describe('prompt', () => {
    it('includes clinical-note addendums', () => {
      const prompt = buildUserPrompt({
        allergies: [],
        chronicDiseases: [],
        currentMedications: [],
        recentEncounters: [
          {
            date: '2026-09-01',
            chiefComplaint: 'Đau răng',
            diagnosis: 'Sâu răng',
            treatmentPlan: null,
            addendums: ['Bổ sung: dị ứng Lidocaine'],
            status: 'COMPLETED',
            treatments: [],
          },
        ],
        outstandingInvoiceCount: 0,
        openEncounterCount: 0,
      });
      expect(prompt).toContain('SĐC: Đau răng');
      expect(prompt).toContain('dị ứng Lidocaine');
    });
  });

  describe('dentist access', () => {
    const dentist = {
      sub: 'dentist-1',
      email: 'd@example.invalid',
      permissions: ['ai.summary.read'],
    };

    it('allows a dentist with a live appointment and refuses one whose bookings were cancelled', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue({ patientId: 'pat-1', bullets: [] });
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(service.getPatientSummary('pat-1', 3, false, dentist)).resolves.toMatchObject({
        cached: true,
      });
      await expect(service.getPatientSummary('pat-1', 3, false, dentist)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.appointment.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          deletedAt: null,
          OR: expect.arrayContaining([
            { status: { in: ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] } },
          ]),
        }),
      });
    });
  });

  describe('front desk (no clinical read)', () => {
    const receptionist = {
      sub: 'rec-1',
      email: 'r@example.invalid',
      permissions: ['ai.summary.read', 'patient.update', 'encounter.read.basic'],
    };

    it('gets only allergy/history and pending bullets, never diagnosis or plan', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue(null);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([
        {
          ...validEncounter({ status: 'COMPLETED' }),
          clinicalNote: { diagnosis: 'Viêm tủy', treatmentPlan: 'Chữa tủy R36', addendums: [] },
          treatments: [],
        },
      ]);
      (prisma.encounter.count as jest.Mock).mockResolvedValue(1);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(2);

      const result = await service.getPatientSummary('pat-1', 3, false, receptionist);

      expect(prisma.encounter.findMany).not.toHaveBeenCalled();
      expect(prisma.appointment.count).not.toHaveBeenCalled(); // whole roster
      expect(result.bullets.map(b => b.id)).toEqual(['allergy', 'open']);
      expect(JSON.stringify(result)).not.toMatch(/Viêm tủy|Chữa tủy/);
      expect(result.asOf.encounterCount).toBe(0);
      expect(cache.getJSON).toHaveBeenCalledWith('ai:patient:pat-1:top3:basic');
      expect(cache.setJSON).toHaveBeenCalledWith(
        'ai:patient:pat-1:top3:basic',
        expect.anything(),
        expect.any(Number),
      );
    });

    it('drops a "next" bullet the model returns for the front desk', async () => {
      const values: Record<string, string> = { AI_BASE_URL: 'https://gw.test/v1', AI_MODEL: 'm' };
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [
              { message: { content: '{"allergy":"Penicillin","open":"","next":"Chữa tủy"}' } },
            ],
          }),
      } as any);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: PrismaService, useValue: prisma },
          { provide: RedisCacheService, useValue: cache },
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => values[k]) } },
        ],
      }).compile();
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue(null);

      const result = await module
        .get<AiService>(AiService)
        .getPatientSummary('pat-1', 3, true, receptionist);

      expect(result.bullets.map(b => b.id)).toEqual(['allergy']);
      fetchMock.mockRestore();
    });

    it('keeps full and basic summaries in separate cache entries', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(basePatient);
      (cache.getJSON as jest.Mock).mockResolvedValue({ patientId: 'pat-1', bullets: [] });
      await service.getPatientSummary('pat-1', 3, false, actor);
      await service.getPatientSummary('pat-1', 3, false, receptionist);
      expect(cache.getJSON).toHaveBeenNthCalledWith(1, 'ai:patient:pat-1:top3:full');
      expect(cache.getJSON).toHaveBeenNthCalledWith(2, 'ai:patient:pat-1:top3:basic');
    });
  });

  describe('cache invalidation', () => {
    it('drops every cached variant of the patient on clinical-data and encounter-closed events', async () => {
      cache.delByPattern = jest.fn().mockResolvedValue(1);
      await service.onClinicalDataChanged({ patientId: 'pat-1' });
      await service.onEncounterClosed({ patientId: 'pat-2' } as any);
      expect(cache.delByPattern).toHaveBeenNthCalledWith(1, 'ai:patient:pat-1:*');
      expect(cache.delByPattern).toHaveBeenNthCalledWith(2, 'ai:patient:pat-2:*');
    });
  });
});
