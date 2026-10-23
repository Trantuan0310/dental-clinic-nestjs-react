import { MessageChannel } from '@prisma/client';

export type MessageTemplate = 'VISIT_REMINDER' | 'RECALL_REMINDER' | 'TEST';

export interface PhoneMessage {
  /** 0xxxxxxxxx */
  phone: string;
  template: MessageTemplate;
  /** The plain text (SMS, and the log). */
  text: string;
  /** Values for a Zalo ZNS template. */
  params: Record<string, string>;
  /** Unique per message; providers that support it use it to drop repeats. */
  trackingId: string;
}

export interface SendResult {
  ok: boolean;
  /** No real message left: the provider is the mock. */
  mocked?: boolean;
  providerId?: string;
  error?: string;
}

export interface PhoneProvider {
  readonly name: string;
  readonly channel: MessageChannel;
  send(message: PhoneMessage): Promise<SendResult>;
}

/** Writes the message to the log only. */
export class MockProvider implements PhoneProvider {
  readonly name = 'mock';
  constructor(readonly channel: MessageChannel) {}
  async send(): Promise<SendResult> {
    return { ok: true, mocked: true };
  }
}

/** The error text of a failed HTTP call, short enough for the log. */
export function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 450);
}
