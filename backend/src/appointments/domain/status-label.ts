import { AppointmentStatus } from '@prisma/client';

/** Appointment statuses as front desk reads them in messages. */
export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: 'đã đặt',
  CONFIRMED: 'đã xác nhận',
  CHECKED_IN: 'đã check-in',
  IN_PROGRESS: 'đang khám',
  COMPLETED: 'đã hoàn thành',
  CANCELLED: 'đã hủy',
  NO_SHOW: 'vắng mặt',
  LEFT: 'đã về (chưa khám)',
};
