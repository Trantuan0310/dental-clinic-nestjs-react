import type { AxiosError } from 'axios';
import type { BadgeProps } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/errors';
import { i18n } from '@/locales';
import { translatedLabels } from '@/locales/labels';
import type {
  BlockingAppointment,
  EmployeeType,
  EmploymentStatus,
  Gender,
  PracticeStatus,
} from './types';

export const EMPLOYEE_TYPE_LABEL = translatedLabels<EmployeeType>({
  DENTIST: 'uiWorkforce.employeeType_DENTIST',
  ASSISTANT: 'uiWorkforce.employeeType_ASSISTANT',
  RECEPTIONIST: 'uiWorkforce.employeeType_RECEPTIONIST',
  MANAGER: 'uiWorkforce.employeeType_MANAGER',
  OTHER: 'uiWorkforce.employeeType_OTHER',
});

export const EMPLOYMENT_STATUS_LABEL = translatedLabels<EmploymentStatus>({
  ACTIVE: 'uiWorkforce.employment_ACTIVE',
  ON_LEAVE: 'uiWorkforce.employment_ON_LEAVE',
  TERMINATED: 'uiWorkforce.employment_TERMINATED',
});

export const EMPLOYMENT_STATUS_VARIANT: Record<EmploymentStatus, BadgeProps['variant']> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  TERMINATED: 'default',
};

export const PRACTICE_STATUS_LABEL = translatedLabels<PracticeStatus>({
  ACTIVE: 'uiWorkforce.practiceLabel_ACTIVE',
  SUSPENDED: 'uiWorkforce.practiceLabel_SUSPENDED',
  INACTIVE: 'uiWorkforce.practiceLabel_INACTIVE',
});

export const PRACTICE_STATUS_VARIANT: Record<PracticeStatus, BadgeProps['variant']> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  INACTIVE: 'default',
};

export const GENDER_LABEL = translatedLabels<Gender>({
  MALE: 'uiWorkforce.gender_MALE',
  FEMALE: 'uiWorkforce.gender_FEMALE',
  OTHER: 'uiWorkforce.gender_OTHER',
  UNDISCLOSED: 'uiWorkforce.gender_UNDISCLOSED',
});

/** Same fixed codes as the backend DTO (DENTIST_SPECIALTIES). */
export const SPECIALTY_LABEL: Record<string, string> = translatedLabels({
  TONG_QUAT: 'uiWorkforce.specialty_TONG_QUAT',
  NHA_CHU: 'uiWorkforce.specialty_NHA_CHU',
  NOI_NHA: 'uiWorkforce.specialty_NOI_NHA',
  CHINH_NHA: 'uiWorkforce.specialty_CHINH_NHA',
  NHO_RANG: 'uiWorkforce.specialty_NHO_RANG',
  PHUC_HINH: 'uiWorkforce.specialty_PHUC_HINH',
  IMPLANT: 'uiWorkforce.specialty_IMPLANT',
  NHA_TRE_EM: 'uiWorkforce.specialty_NHA_TRE_EM',
  THAM_MY: 'uiWorkforce.specialty_THAM_MY',
});

export const CALENDAR_COLORS = [
  '#2563EB',
  '#16A34A',
  '#DC2626',
  '#9333EA',
  '#EA580C',
  '#0891B2',
  '#DB2777',
  '#65A30D',
];

const WEEKDAY_SHORT_KEYS = [
  'uiWorkforce.weekdayShort_0',
  'uiWorkforce.weekdayShort_1',
  'uiWorkforce.weekdayShort_2',
  'uiWorkforce.weekdayShort_3',
  'uiWorkforce.weekdayShort_4',
  'uiWorkforce.weekdayShort_5',
  'uiWorkforce.weekdayShort_6',
];

/**
 * Short weekday names, Sunday first (index = `Date#getDay()`). Each element is
 * looked up when read, so indexing and `.map()` follow the UI language.
 */
export const DAY_OF_WEEK_LABEL: readonly string[] = WEEKDAY_SHORT_KEYS.reduce<string[]>((labels, key, index) => {
  Object.defineProperty(labels, index, { enumerable: true, get: () => i18n.t(key) });
  return labels;
}, []);

interface StaffErrorBody {
  code?: string;
  message?: string | string[];
  details?: { appointments?: BlockingAppointment[] };
}

const CODE_MESSAGE: Record<string, string> = translatedLabels({
  EMPLOYEE_NOT_FOUND: 'uiWorkforce.staffErrorEmployeeNotFound',
  DENTIST_PROFILE_NOT_FOUND: 'uiWorkforce.staffErrorDentistProfileNotFound',
  DENTIST_PROFILE_NOT_ALLOWED: 'uiWorkforce.staffErrorDentistProfileNotAllowed',
  STAFF_LINK_CONFLICT: 'uiWorkforce.staffErrorLinkConflict',
  LICENSE_NUMBER_TAKEN: 'uiWorkforce.staffErrorLicenseTaken',
  DENTIST_HAS_FUTURE_APPOINTMENTS: 'uiWorkforce.staffErrorDentistHasAppointments',
  CANNOT_REMOVE_LAST_ADMIN: 'uiWorkforce.staffErrorLastAdmin',
  EMAIL_ALREADY_EXISTS: 'uiWorkforce.staffErrorEmailTaken',
});

/** Localized message for a staff API error, keyed by its business code. */
export function staffErrorMessage(error: unknown, fallback: string): string {
  const body = (error as AxiosError<StaffErrorBody>)?.response?.data;
  if (body?.code && CODE_MESSAGE[body.code]) return CODE_MESSAGE[body.code];
  return getApiErrorMessage(error, fallback);
}

/** Bookings that block suspending/terminating a dentist (BR-STAFF-004). */
export function blockingAppointments(error: unknown): BlockingAppointment[] | null {
  const body = (error as AxiosError<StaffErrorBody>)?.response?.data;
  return body?.code === 'DENTIST_HAS_FUTURE_APPOINTMENTS'
    ? (body.details?.appointments ?? [])
    : null;
}
