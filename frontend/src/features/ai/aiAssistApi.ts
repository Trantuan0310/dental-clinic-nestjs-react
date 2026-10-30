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

export type MessageKind = 'appointment_reminder' | 'recall_reminder' | 'reply';

export interface MessageDraftRequest {
  kind: MessageKind;
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
};
