import { api, unwrap } from '@/lib/api';
export interface TemplateTreatment {
  serviceId: string;
  quantity: number;
  inventoryUsages: { inventoryItemId: string; quantity: number; unit: string }[];
}
export interface VisitTemplatePayload {
  name: string;
  serviceId: string;
  soap: { subjective: string; objective: string; assessment: string; plan: string };
  treatments: TemplateTreatment[];
}
export interface VisitTemplate extends VisitTemplatePayload {
  id: string;
  updatedAt: string;
}
export interface TemplatePreview extends Omit<VisitTemplate, 'treatments'> {
  treatments: (TemplateTreatment & { procedure: string; unitPrice: number })[];
  alreadyApplied: boolean;
  version: string;
}
const base = '/medical-records';
export const visitTemplatesApi = {
  async list(): Promise<VisitTemplate[]> {
    return unwrap((await api.get(`${base}/visit-templates`)).data);
  },
  async save(id: string | undefined, body: VisitTemplatePayload): Promise<VisitTemplate> {
    return unwrap(
      (
        await (id
          ? api.put(`${base}/visit-templates/${id}`, body)
          : api.post(`${base}/visit-templates`, body))
      ).data,
    );
  },
  async remove(id: string) {
    await api.delete(`${base}/visit-templates/${id}`);
  },
  async preview(encounterId: string, templateId: string): Promise<TemplatePreview> {
    return unwrap(
      (await api.get(`${base}/encounters/${encounterId}/visit-templates/${templateId}/preview`))
        .data,
    );
  },
  async apply(encounterId: string, template: TemplatePreview) {
    return unwrap(
      (
        await api.post(`${base}/encounters/${encounterId}/visit-templates/apply`, {
          templateId: template.id,
          version: template.version,
        })
      ).data,
    );
  },
};
