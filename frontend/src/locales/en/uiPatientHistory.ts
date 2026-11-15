import type { vi } from '../uiPatientHistory';

export const en: typeof vi = {
  button: 'Send history link',
  title: 'Visit history link',
  sentTo: 'The link was sent to {{to}}. The patient opens it to see their visits, treatments and invoices.',
  notSent: 'The record has no email or phone that can receive it. Copy the link and give it to the patient.',
  link: 'Link',
  copy: 'Copy',
  copied: 'Link copied',
  expires: 'Valid until {{date}}. Share it only with the patient.',
  issueError: 'Could not create the link',
};
