import { api, unwrap } from '@/lib/api';
import type { SummarySource } from '@/features/dashboard/aiSummaryApi';

export interface NoteDraft {
  chiefComplaint: string;
  diagnosis: string;
  treatmentPlan: string;
  notes: string;
  source: SummarySource;
  model?: string;
}

export type MessageKind = 'appointment_reminder' | 'recall_reminder' | 'waitlist_invite' | 'reply';

export interface MessageDraftRequest {
  kind: MessageKind;
  waitlistId?: string;
  appointmentId?: string;
  recallId?: string;
  customerMessage?: string;
  staffNote?: string;
}

export interface MessageDraft {
  text: string;
  phone: string | null;
  source: SummarySource;
  model?: string;
}

export interface ReportCommentary {
  from: string;
  to: string;
  points: string[];
  generatedAt: string;
  source: SummarySource;
  model?: string;
  cached: boolean;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantCard {
  type: 'create_appointment';
  payload: { patientId: string; dentistId: string; startAt: string; reason?: string };
  view: { patientRef: string; dentistName: string; startAt: string; reason: string | null };
}

export interface AssistantReply {
  /** Patients appear as [P1]; fill them with `names`. */
  reply: string;
  refs: Record<string, string>;
  names: Record<string, string>;
  actions: AssistantCard[];
  tools: string[];
  source: SummarySource;
  model?: string;
}

/** Drafts only: saving a note or sending a message goes through the usual endpoints. */
export const aiAssistApi = {
  async draftNote(encounterId: string, text: string): Promise<NoteDraft> {
    const { data } = await api.post<{ data: NoteDraft }>('/ai/drafts/clinical-note', { encounterId, text });
    return unwrap(data);
  },
  async draftMessage(body: MessageDraftRequest): Promise<MessageDraft> {
    const { data } = await api.post<{ data: MessageDraft }>('/ai/drafts/message', body);
    return unwrap(data);
  },
  async reportCommentary(from: string, to: string, refresh = false): Promise<ReportCommentary> {
    const { data } = await api.get<{ data: ReportCommentary }>('/ai/report-commentary', {
      params: { from, to, ...(refresh ? { refresh: 'true' } : {}) },
    });
    return unwrap(data);
  },
  async assistantChat(messages: ChatTurn[], refs: Record<string, string>): Promise<AssistantReply> {
    const { data } = await api.post<{ data: AssistantReply }>('/ai/assistant/chat', { messages, refs });
    return unwrap(data);
  },
  async confirmAppointment(payload: AssistantCard['payload']): Promise<{ id: string }> {
    const { data } = await api.post<{ data: { id: string } }>('/ai/assistant/actions/create-appointment', payload);
    return unwrap(data);
  },
};
