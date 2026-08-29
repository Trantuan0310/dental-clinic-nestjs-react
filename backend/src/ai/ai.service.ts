import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { SYSTEM_PROMPT, buildUserPrompt, type SummaryInput } from './prompts/summary-prompt';
import { AiPatientSummary, SummaryBullet, SummarySource } from './ai.types';

const CACHE_TTL_SECONDS = 3600;
const MAX_TOKENS = 350;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    config: ConfigService,
  ) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-3.6-flash';
    this.genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    if (!this.genAI) {
      this.logger.warn('GEMINI_API_KEY not set; AI summary will always fall back to rule-based');
    }
  }

  async getPatientSummary(
    patientId: string,
    top: number,
    refresh: boolean,
  ): Promise<AiPatientSummary> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true, allergies: true, chronicDiseases: true, currentMedications: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const cacheKey = this.cacheKey(patientId, top);
    if (!refresh) {
      const cached = await this.cache.getJSON<AiPatientSummary>(cacheKey);
      if (cached) return { ...cached, cached: true };
    }

    const input = await this.collectSummaryInput(patientId, top, patient);
    let bullets: SummaryBullet[] = [];
    let source: SummarySource = 'fallback';
    let modelName: string | undefined;

    if (this.genAI) {
      try {
        const llmResult = await this.callGemini(input);
        bullets = llmResult.bullets;
        source = 'gemini';
        modelName = llmResult.model;
      } catch (err) {
        this.logger.warn(`Gemini failed, using fallback: ${(err as Error).message}`);
        bullets = this.ruleBasedSummary(input);
      }
    } else {
      bullets = this.ruleBasedSummary(input);
    }

    const asOf = {
      encounterCount: input.recentEncounters.length,
      lastVisitAt: this.lastVisitAt(input),
    };

    const result: AiPatientSummary = {
      patientId,
      generatedAt: new Date().toISOString(),
      source,
      model: modelName,
      bullets,
      asOf,
      cached: false,
    };

    await this.cache.setJSON(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  private cacheKey(patientId: string, top: number): string {
    return `ai:patient:${patientId}:top${top}`;
  }

  private async collectSummaryInput(
    patientId: string,
    top: number,
    patient: { allergies: unknown; chronicDiseases: unknown; currentMedications: unknown },
  ): Promise<SummaryInput & { openEncounterCount: number; outstandingInvoiceCount: number }> {
    const [encounters, openEncounterCount, outstandingInvoiceCount] = await Promise.all([
      this.prisma.encounter.findMany({
        where: { patientId, cancelledAt: null },
        orderBy: { startedAt: 'desc' },
        take: top,
        select: {
          id: true,
          status: true,
          startedAt: true,
          closedAt: true,
          chiefComplaint: true,
          diagnosis: true,
          treatmentPlanText: true,
          treatments: {
            where: { deletedAt: null },
            orderBy: { sequence: 'asc' },
            take: 8,
            select: { procedure: true, description: true },
          },
        },
      }),
      this.prisma.encounter.count({ where: { patientId, status: 'IN_PROGRESS' } }),
      this.prisma.invoice.count({
        where: { patientId, outstandingAmount: { gt: 0 }, voidedAt: null, deletedAt: null },
      }),
    ]);

    return {
      allergies: this.normalizeStringList(patient.allergies),
      chronicDiseases: this.normalizeStringList(patient.chronicDiseases),
      currentMedications: this.normalizeStringList(patient.currentMedications),
      recentEncounters: encounters.map(e => ({
        date: e.startedAt.toISOString().slice(0, 10),
        chiefComplaint: e.chiefComplaint,
        diagnosis: e.diagnosis,
        treatmentPlan: e.treatmentPlanText,
        status: e.status,
        treatments: e.treatments.map(t => ({ code: null, name: t.procedure })),
      })),
      openEncounterCount,
      outstandingInvoiceCount,
    };
  }

  private normalizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map(v => v.trim());
  }

  private async callGemini(
    input: SummaryInput,
  ): Promise<{ bullets: SummaryBullet[]; model: string }> {
    if (!this.genAI) throw new ServiceUnavailableException('Gemini not configured');

    const model = this.genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: MAX_TOKENS,
        responseMimeType: 'application/json',
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    const prompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(input)}`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    if (!text) throw new Error('Empty Gemini response');

    let parsed: { allergy?: string; open?: string; next?: string };
    try {
      parsed = JSON.parse(text) as { allergy?: string; open?: string; next?: string };
    } catch {
      throw new Error('Invalid JSON from Gemini');
    }

    return {
      bullets: this.parseBullets(parsed),
      model: this.model,
    };
  }

  private parseBullets(raw: { allergy?: string; open?: string; next?: string }): SummaryBullet[] {
    const bullets: SummaryBullet[] = [];
    if (raw.allergy?.trim()) {
      bullets.push({
        id: 'allergy',
        icon: 'alert',
        label: 'Dị ứng',
        text: this.cleanText(raw.allergy),
      });
    }
    if (raw.open?.trim()) {
      bullets.push({
        id: 'open',
        icon: 'clock',
        label: 'Đang chờ',
        text: this.cleanText(raw.open),
      });
    }
    if (raw.next?.trim()) {
      bullets.push({
        id: 'next',
        icon: 'stethoscope',
        label: 'Lần tới',
        text: this.cleanText(raw.next),
      });
    }
    return bullets;
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  private ruleBasedSummary(
    input: SummaryInput & { openEncounterCount: number; outstandingInvoiceCount: number },
  ): SummaryBullet[] {
    const bullets: SummaryBullet[] = [];

    const allergyParts: string[] = [];
    if (input.allergies.length) allergyParts.push(`Dị ứng: ${input.allergies.join(', ')}`);
    if (input.chronicDiseases.length)
      allergyParts.push(`Bệnh nền: ${input.chronicDiseases.join(', ')}`);
    if (input.currentMedications.length)
      allergyParts.push(`Thuốc: ${input.currentMedications.join(', ')}`);
    if (allergyParts.length) {
      bullets.push({
        id: 'allergy',
        icon: 'alert',
        label: 'Dị ứng',
        text: allergyParts.join(' · '),
      });
    }

    const openParts: string[] = [];
    if (input.openEncounterCount > 0) {
      openParts.push(`${input.openEncounterCount} phiên khám đang mở`);
    }
    if (input.outstandingInvoiceCount > 0) {
      openParts.push(`${input.outstandingInvoiceCount} hóa đơn chưa thanh toán`);
    }
    if (openParts.length) {
      bullets.push({ id: 'open', icon: 'clock', label: 'Đang chờ', text: openParts.join(' · ') });
    }

    const latest = input.recentEncounters[0];
    if (latest?.treatmentPlan) {
      bullets.push({
        id: 'next',
        icon: 'stethoscope',
        label: 'Lần tới',
        text: `${latest.date}: ${latest.treatmentPlan}`,
      });
    } else if (latest) {
      bullets.push({
        id: 'next',
        icon: 'stethoscope',
        label: 'Lần tới',
        text: `${latest.date}: ${latest.diagnosis || latest.chiefComplaint || 'Theo dõi chung'}`,
      });
    }

    return bullets;
  }

  private lastVisitAt(input: SummaryInput): string | undefined {
    return input.recentEncounters[0]?.date;
  }
}
