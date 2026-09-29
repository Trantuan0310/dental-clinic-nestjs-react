import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { SYSTEM_PROMPT, buildUserPrompt, type SummaryInput } from './prompts/summary-prompt';
import { AiPatientSummary, SummaryBullet, SummarySource } from './ai.types';
import { JwtPayload } from '../common/guards/permissions.guard';
import { CompatibleLlm, createCompatibleLlm, extractJsonObject } from './compatible-llm';
import { dentistCanReadPatient } from '../common/dentist-patient-access';
import {
  ENCOUNTER_CLOSED_EVENT,
  EncounterClosedEvent,
  PATIENT_CLINICAL_DATA_CHANGED_EVENT,
  PatientClinicalDataChangedEvent,
} from '../common/events/domain-events';

const CACHE_TTL_SECONDS = 3600;
const MAX_TOKENS = 350;
/** Addendums per encounter fed to the summary (newest first). */
const ADDENDUMS_PER_ENCOUNTER = 2;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly model: string;
  /** A gateway model (AI_BASE_URL); preferred over Gemini when configured. */
  private readonly gateway: CompatibleLlm | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    config: ConfigService,
  ) {
    this.gateway = createCompatibleLlm(key => config.get<string>(key));
    const apiKey = config.get<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-3.6-flash';
    this.genAI = apiKey && !this.gateway ? new GoogleGenerativeAI(apiKey) : null;
    if (this.gateway) {
      this.logger.log(`AI summary uses ${this.gateway.format} gateway model ${this.gateway.model}`);
    } else if (!this.genAI) {
      this.logger.warn(
        'Neither AI_BASE_URL nor GEMINI_API_KEY is set; AI summary will always fall back to rule-based',
      );
    }
  }

  async getPatientSummary(
    patientId: string,
    top: number,
    refresh: boolean,
    actor: JwtPayload,
  ): Promise<AiPatientSummary> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true, allergies: true, chronicDiseases: true, currentMedications: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    // Match PatientsService's roster scope, including when a cached summary exists.
    if (
      !actor.permissions.includes('patient.update') &&
      !actor.permissions.includes('patient.delete')
    ) {
      // Same scope as the patient record: treated (non-cancelled encounter)
      // or booked with a live/completed appointment — a first-visit patient
      // on today's list counts; a CANCELLED/NO_SHOW booking does not.
      if (!(await dentistCanReadPatient(this.prisma, patientId, actor.sub))) {
        throw new NotFoundException('Patient not found');
      }
    }

    const cacheKey = this.cacheKey(patientId, top);
    if (!refresh) {
      const cached = await this.cache.getJSON<AiPatientSummary>(cacheKey);
      if (cached) return { ...cached, cached: true };
    }

    const input = await this.collectSummaryInput(patientId, top, patient);
    let bullets: SummaryBullet[] = [];
    let source: SummarySource = 'fallback';
    let modelName: string | undefined;

    if (this.gateway || this.genAI) {
      try {
        const llmResult = this.gateway
          ? await this.callGateway(this.gateway, input)
          : await this.callGemini(input);
        bullets = llmResult.bullets;
        source = this.gateway ? 'llm' : 'gemini';
        modelName = llmResult.model;
      } catch (err) {
        this.logger.warn(`AI model failed, using fallback: ${(err as Error).message}`);
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

  /** Drop every cached summary (all `top` variants) of one patient. */
  async invalidatePatientSummary(patientId: string): Promise<void> {
    await this.cache.delByPattern(`ai:patient:${patientId}:*`);
  }

  @OnEvent(PATIENT_CLINICAL_DATA_CHANGED_EVENT)
  async onClinicalDataChanged(payload: PatientClinicalDataChangedEvent): Promise<void> {
    await this.invalidatePatientSummary(payload.patientId);
  }

  @OnEvent(ENCOUNTER_CLOSED_EVENT)
  async onEncounterClosed(payload: EncounterClosedEvent): Promise<void> {
    await this.invalidatePatientSummary(payload.patientId);
  }

  private async collectSummaryInput(
    patientId: string,
    top: number,
    patient: { allergies: unknown; chronicDiseases: unknown; currentMedications: unknown },
  ): Promise<SummaryInput & { openEncounterCount: number; outstandingInvoiceCount: number }> {
    const [encounters, openEncounterCount, outstandingInvoiceCount] = await Promise.all([
      this.prisma.encounter.findMany({
        where: { patientId, cancelledAt: null, status: { not: 'CANCELLED' } },
        orderBy: { startedAt: 'desc' },
        take: top,
        select: {
          id: true,
          status: true,
          startedAt: true,
          closedAt: true,
          // The record lives in ClinicalNote (one per encounter, upserted in
          // place) plus append-only addendums; the legacy encounter columns
          // chiefComplaint/diagnosis/treatmentPlanText are never written.
          clinicalNote: {
            select: {
              chiefComplaint: true,
              diagnosis: true,
              treatmentPlan: true,
              addendums: {
                orderBy: { addedAt: 'desc' },
                take: ADDENDUMS_PER_ENCOUNTER,
                select: { content: true },
              },
            },
          },
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
        chiefComplaint: e.clinicalNote?.chiefComplaint ?? null,
        diagnosis: e.clinicalNote?.diagnosis ?? null,
        treatmentPlan: e.clinicalNote?.treatmentPlan ?? null,
        addendums: (e.clinicalNote?.addendums ?? []).map(a => a.content),
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

  private async callGateway(
    gateway: CompatibleLlm,
    input: SummaryInput,
  ): Promise<{ bullets: SummaryBullet[]; model: string }> {
    const text = await gateway.complete(
      `${SYSTEM_PROMPT}\n\nChỉ trả về một đối tượng JSON, không kèm giải thích.`,
      buildUserPrompt(input),
      MAX_TOKENS,
    );
    const parsed = extractJsonObject(text) as { allergy?: string; open?: string; next?: string };
    return { bullets: this.parseBullets(parsed, input), model: gateway.model };
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
      bullets: this.parseBullets(parsed, input),
      model: this.model,
    };
  }

  private parseBullets(
    raw: { allergy?: string; open?: string; next?: string },
    input: SummaryInput,
  ): SummaryBullet[] {
    const bullets: SummaryBullet[] = [];
    if (raw.allergy?.trim()) {
      bullets.push({
        id: 'allergy',
        icon: 'alert',
        label: 'Dị ứng',
        text: this.cleanText(raw.allergy),
        basis: this.allergyBasis(input),
      });
    }
    if (raw.open?.trim()) {
      bullets.push({
        id: 'open',
        icon: 'clock',
        label: 'Đang chờ',
        text: this.cleanText(raw.open),
        basis: 'Từ số phiên khám đang mở và hóa đơn chưa thanh toán trong hồ sơ',
      });
    }
    if (raw.next?.trim()) {
      bullets.push({
        id: 'next',
        icon: 'stethoscope',
        label: 'Lần tới',
        text: this.cleanText(raw.next),
        basis: this.nextVisitBasis(input),
      });
    }
    return bullets;
  }

  // These mirror what actually feeds each bullet in both callGemini() and
  // ruleBasedSummary() — the AI/fallback distinction only changes who wrote
  // the sentence, not which record it's about, so the same basis text is
  // accurate either way.
  private allergyBasis(input: SummaryInput): string {
    const parts: string[] = [];
    if (input.allergies.length) parts.push('dị ứng');
    if (input.chronicDiseases.length) parts.push('bệnh nền');
    if (input.currentMedications.length) parts.push('thuốc đang dùng');
    return parts.length ? `Từ hồ sơ bệnh nhân (${parts.join(', ')})` : 'Từ hồ sơ bệnh nhân';
  }

  private nextVisitBasis(input: SummaryInput): string {
    const latest = input.recentEncounters[0];
    if (!latest) return 'Từ hồ sơ bệnh nhân';
    return `Từ ghi chú khám ngày ${latest.date}${latest.treatmentPlan ? ' (kế hoạch điều trị)' : ''}`;
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
        basis: this.allergyBasis(input),
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
      bullets.push({
        id: 'open',
        icon: 'clock',
        label: 'Đang chờ',
        text: openParts.join(' · '),
        basis: 'Từ số phiên khám đang mở và hóa đơn chưa thanh toán trong hồ sơ',
      });
    }

    const latest = input.recentEncounters[0];
    if (latest?.treatmentPlan) {
      bullets.push({
        id: 'next',
        icon: 'stethoscope',
        label: 'Lần tới',
        text: `${latest.date}: ${latest.treatmentPlan}`,
        basis: this.nextVisitBasis(input),
      });
    } else if (latest) {
      bullets.push({
        id: 'next',
        icon: 'stethoscope',
        label: 'Lần tới',
        text: `${latest.date}: ${latest.diagnosis || latest.chiefComplaint || 'Theo dõi chung'}`,
        basis: this.nextVisitBasis(input),
      });
    }

    return bullets;
  }

  private lastVisitAt(input: SummaryInput): string | undefined {
    return input.recentEncounters[0]?.date;
  }
}
