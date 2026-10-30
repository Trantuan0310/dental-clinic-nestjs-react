import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CompatibleLlm, createCompatibleLlm, extractJsonObject } from './compatible-llm';
import type { SummarySource } from './ai.types';

export interface ModelReply {
  data: Record<string, unknown>;
  source: Exclude<SummarySource, 'fallback'>;
  model: string;
}

/**
 * The chat model behind the drafting features (note, message, report
 * commentary): the AI_BASE_URL gateway when set, else Gemini, else none.
 * Same configuration as the patient summary. Callers keep a rule-based
 * answer for `null` (not configured) and for a thrown error.
 */
@Injectable()
export class AiModel {
  private readonly logger = new Logger(AiModel.name);
  private readonly gateway: CompatibleLlm | null;
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly geminiModel: string;

  constructor(config: ConfigService) {
    this.gateway = createCompatibleLlm(key => config.get<string>(key));
    const apiKey = config.get<string>('GEMINI_API_KEY');
    this.geminiModel = config.get<string>('GEMINI_MODEL') ?? 'gemini-3.6-flash';
    this.genAI = apiKey && !this.gateway ? new GoogleGenerativeAI(apiKey) : null;
  }

  get configured(): boolean {
    return !!(this.gateway || this.genAI);
  }

  /** One JSON object from the model, or null when no model is configured. Throws on failure. */
  async json(system: string, user: string, maxTokens: number): Promise<ModelReply | null> {
    if (this.gateway) {
      const text = await this.gateway.complete(
        `${system}\n\nChỉ trả về một đối tượng JSON, không kèm giải thích.`,
        user,
        maxTokens,
      );
      return { data: asObject(extractJsonObject(text)), source: 'llm', model: this.gateway.model };
    }
    if (this.genAI) {
      const model = this.genAI.getGenerativeModel({
        model: this.geminiModel,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      });
      const text = (await model.generateContent(`${system}\n\n${user}`)).response.text();
      if (!text) throw new Error('Empty Gemini response');
      return { data: asObject(extractJsonObject(text)), source: 'gemini', model: this.geminiModel };
    }
    return null;
  }

  /** `json`, with any failure logged and turned into null (the caller's fallback). */
  async tryJson(
    feature: string,
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<ModelReply | null> {
    try {
      return await this.json(system, user, maxTokens);
    } catch (err) {
      this.logger.warn(`AI ${feature} failed, using fallback: ${(err as Error).message}`);
      return null;
    }
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI response is not a JSON object');
  }
  return value as Record<string, unknown>;
}

/** A string field of a model reply, whitespace-collapsed and capped; '' when missing. */
export function textField(data: Record<string, unknown>, key: string, max: number): string {
  const value = data[key];
  if (typeof value !== 'string') return '';
  return value
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}
