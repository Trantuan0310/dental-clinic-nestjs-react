import { formatVnd } from "@/lib/format";

export type Rating = { average: number | null; count: number };
export type BookingDentist = {
  id: string;
  fullName: string;
  title?: string | null;
  position?: string | null;
  yearsOfExperience?: number | null;
  specialties: string[];
  bio?: string | null;
  rating?: Rating;
  /** This dentist's own visit length for the service. */
  durationMinutes?: number;
  /** This dentist's price for the service; absent when the clinic does not publish it. */
  price?: number;
};
export type BookingService = {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  durationMinutes: number;
  /** Left out when the clinic does not publish the price. */
  basePrice?: string | number;
  isFree?: boolean;
  /** Lowest published price among the dentists; null = ask the clinic. */
  price?: number | null;
  priceFrom?: boolean;
  dentists: BookingDentist[];
};

/** "BS. Nguyễn Minh Khoa" with title "ThS. BS" → "ThS. BS Nguyễn Minh Khoa" (no doubled "BS."). */
export function dentistDisplayName(d: Pick<BookingDentist, "title" | "fullName">) {
  if (!d.title) return d.fullName;
  const bare = d.fullName.replace(/^(bs|bác sĩ|ths|ts|pgs)\.?\s+/i, "");
  return `${d.title} ${bare}`;
}

export function initials(fullName: string) {
  const parts = fullName.replace(/^(bs|bác sĩ)\.?\s+/i, "").trim().split(/\s+/);
  return ((parts.at(-2)?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

/** Price text of a service (lowest price across dentists). */
export function servicePriceText(s: BookingService, t: (k: string, o?: Record<string, unknown>) => string) {
  if (s.isFree) return t("uiScheduling.bookingWizard.free");
  if (s.price == null) return t("uiScheduling.bookingWizard.priceOnRequest");
  return s.priceFrom ? t("uiScheduling.bookingWizard.priceFrom", { price: formatVnd(s.price) }) : formatVnd(s.price);
}

export function dentistPriceText(d: BookingDentist, t: (k: string) => string) {
  if (d.price === undefined) return t("uiScheduling.bookingWizard.priceOnRequest");
  return d.price === 0 ? t("uiScheduling.bookingWizard.free") : formatVnd(d.price);
}

