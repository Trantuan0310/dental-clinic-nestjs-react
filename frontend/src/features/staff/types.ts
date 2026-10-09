export type EmployeeType = 'DENTIST' | 'ASSISTANT' | 'RECEPTIONIST' | 'MANAGER' | 'OTHER';
export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type PracticeStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';

export interface Employee {
  id: string;
  code: string;
  fullName: string;
  dob: string | null;
  gender: Gender | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  employeeType: EmployeeType;
  hireDate: string;
  terminationDate: string | null;
  employmentStatus: EmploymentStatus;
  notes: string | null;
  account: { id: string; email: string; status: string } | null;
  dentistProfile: {
    id: string;
    practiceStatus: PracticeStatus;
    calendarColor: string;
    licenseNumber: string | null;
  } | null;
}

/** PATCH /employees/:id: going ON_LEAVE lists the dentist's bookings still ahead. */
export interface UpdatedEmployee extends Employee {
  futureAppointments?: BlockingAppointment[];
}

/** POST /employees/:id/account: inviteSent=false when the setup email was not sent. */
export interface LinkedEmployee extends Employee {
  inviteSent: boolean | null;
}

/** GET /employees/linkable-accounts. */
export interface LinkableAccount {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'PENDING_SETUP' | 'DEACTIVATED';
  roles: string[];
}

export interface EmployeeListResponse {
  data: Employee[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface EmployeeFilters {
  q?: string;
  type?: EmployeeType;
  status?: EmploymentStatus;
  page?: number;
  pageSize?: number;
}

export interface EmployeePayload {
  fullName: string;
  employeeType: EmployeeType;
  dob?: string | null;
  gender?: Gender | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hireDate?: string;
  employmentStatus?: 'ACTIVE' | 'ON_LEAVE';
  notes?: string | null;
}

export interface DentistProfile {
  id: string;
  userId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  loginEmail: string;
  accountStatus: 'ACTIVE' | 'PENDING_SETUP' | 'DEACTIVATED';
  employmentStatus: EmploymentStatus;
  licenseNumber: string | null;
  licenseIssuedAt: string | null;
  specialties: string[];
  calendarColor: string;
  defaultSlotMinutes: number;
  acceptsOnlineBooking: boolean;
  acceptsNewPatients: boolean;
  practiceStatus: PracticeStatus;
  bio: string | null;
}

export interface DentistProfilePayload {
  licenseNumber?: string | null;
  licenseIssuedAt?: string | null;
  specialties?: string[];
  calendarColor?: string;
  defaultSlotMinutes?: number;
  acceptsOnlineBooking?: boolean;
  acceptsNewPatients?: boolean;
  bio?: string | null;
}

/** What still keeps a dentist out of the booking screens / public site. */
export interface DentistReadiness {
  accountStatus: 'ACTIVE' | 'PENDING_SETUP' | 'DEACTIVATED';
  practiceStatus: PracticeStatus;
  employmentStatus: EmploymentStatus;
  acceptsOnlineBooking: boolean;
  acceptsNewPatients: boolean;
  hasCurrentSchedule: boolean;
  activeServiceCount: number;
  /** Of those, services offered online (Dịch vụ › "Cho đặt lịch online"). */
  onlineServiceCount: number;
  hasPhoto: boolean;
  /** Name is still the seed's "Quản trị viên". */
  placeholderName: boolean;
}

export interface DentistOverview {
  profile: DentistProfile;
  readiness: DentistReadiness;
  schedules: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    validFrom: string;
    validTo: string | null;
    slotDurationMin: number;
  }>;
  /** null: hidden — only the dentist themself and staff who see every calendar get it. */
  upcomingAppointments: Array<{
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    patient: { id: string; fullName: string; code: string };
  }> | null;
}

/** 409 DENTIST_HAS_FUTURE_APPOINTMENTS details (BR-STAFF-004). */
export interface BlockingAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  patientName: string;
}
