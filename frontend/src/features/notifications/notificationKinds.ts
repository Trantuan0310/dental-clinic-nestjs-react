import {
  CalendarClock,
  ClipboardList,
  FileText,
  Inbox,
  PackageMinus,
  PhoneCall,
  type LucideIcon,
} from 'lucide-react';
import type { InboxNotification, InboxType, PendingKey } from './notificationsApi';

/** What the user may open, to pick the page a notification links to. */
export interface LinkContext {
  admin: boolean;
  anyEncounter: boolean;
}

export interface Kind {
  icon: LucideIcon;
  tone: string;
}

const TONES = {
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-400/10 dark:text-teal-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-400/10 dark:text-orange-300',
};

export const BY_TYPE: Record<InboxType, Kind & { to: (n: InboxNotification, c: LinkContext) => string }> = {
  bookingRequest: { icon: Inbox, tone: TONES.sky, to: () => '/booking-requests' },
  shiftRegistration: {
    icon: CalendarClock,
    tone: TONES.violet,
    to: (_n, c) => (c.admin ? '/admin/shifts/pending' : '/shifts/pending'),
  },
  recallsDue: { icon: PhoneCall, tone: TONES.teal, to: () => '/recalls' },
  draftInvoice: {
    icon: FileText,
    tone: TONES.amber,
    to: (n) => (n.targetId ? `/billing/invoices/${n.targetId}` : '/billing'),
  },
  staleEncounters: {
    icon: ClipboardList,
    tone: TONES.rose,
    to: (_n, c) => (c.anyEncounter ? '/dispatch' : '/my-queue'),
  },
  lowStock: { icon: PackageMinus, tone: TONES.orange, to: () => '/inventory' },
};

export const PENDING_KINDS: Record<PendingKey, Kind & { to: (c: LinkContext) => string }> = {
  bookingRequests: { icon: Inbox, tone: TONES.sky, to: () => '/booking-requests' },
  shiftApprovals: {
    icon: CalendarClock,
    tone: TONES.violet,
    to: (c) => (c.admin ? '/admin/shifts/pending' : '/shifts/pending'),
  },
  recallsDue: { icon: PhoneCall, tone: TONES.teal, to: () => '/recalls' },
  draftInvoices: { icon: FileText, tone: TONES.amber, to: () => '/billing' },
  staleEncounters: {
    icon: ClipboardList,
    tone: TONES.rose,
    to: (c) => (c.anyEncounter ? '/dispatch' : '/my-queue'),
  },
  lowStock: { icon: PackageMinus, tone: TONES.orange, to: () => '/inventory' },
};

export function notificationLink(n: InboxNotification, c: LinkContext): string {
  return BY_TYPE[n.type]?.to(n, c) ?? '/';
}
