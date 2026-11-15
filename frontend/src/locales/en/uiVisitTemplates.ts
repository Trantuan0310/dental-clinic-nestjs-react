import type { vi } from '../uiVisitTemplates';

export const en: typeof vi = {
  title: 'Visit templates', use: 'Use template', add: 'Add template', edit: 'Edit', remove: 'Delete',
  name: 'Template name', service: 'Service', subjective: 'S — Subjective', objective: 'O — Objective',
  assessment: 'A — Assessment', plan: 'P — Treatment plan', treatment: 'Default treatments',
  material: 'Material', quantity: 'Quantity', addTreatment: 'Add treatment', addMaterial: 'Add material',
  save: 'Save template', cancel: 'Cancel', preview: 'Preview', apply: 'Apply', choose: 'Choose template',
  error: 'Unable to process visit template', saved: 'Visit template saved', applied: 'Visit template applied',
  empty: 'No visit templates yet.', loading: 'Loading…', confirmDelete: 'Delete this visit template?',
  appendHint: 'SOAP content is appended to existing notes. Stock is deducted only when the encounter closes.',
  alreadyApplied: 'This template has already been applied to this encounter.',
};
