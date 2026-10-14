import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, DatePicker, Input, Select, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { CALENDAR_COLORS, SPECIALTY_LABEL } from './labels';
import type { DentistProfile, DentistProfilePayload } from './types';

const SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120];

interface DentistProfileFormProps {
  initial?: Partial<DentistProfile>;
  /** 'self' = dentist.update.own: only bio, specialties and colour (BR staff.md §6). */
  mode: 'admin' | 'self';
  submitLabel: string;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (payload: DentistProfilePayload) => void;
}

export function DentistProfileForm({
  initial,
  mode,
  submitLabel,
  submitting,
  onCancel,
  onSubmit,
}: DentistProfileFormProps) {
  const { t } = useTranslation();
  const slotOptions = SLOT_MINUTES.map((minutes) => ({ value: String(minutes), label: t('uiWorkforce.minutesShort', { minutes }) }));
  const [form, setForm] = useState({
    licenseNumber: initial?.licenseNumber ?? '',
    licenseIssuedAt: initial?.licenseIssuedAt ?? '',
    specialties: initial?.specialties ?? [],
    calendarColor: initial?.calendarColor ?? '',
    defaultSlotMinutes: String(initial?.defaultSlotMinutes ?? 30),
    acceptsOnlineBooking: initial?.acceptsOnlineBooking ?? true,
    acceptsNewPatients: initial?.acceptsNewPatients ?? true,
    bio: initial?.bio ?? '',
  });
  const isAdmin = mode === 'admin';

  const toggleSpecialty = (code: string) =>
    setForm((f) => ({
      ...f,
      specialties: f.specialties.includes(code)
        ? f.specialties.filter((s) => s !== code)
        : [...f.specialties, code],
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const self: DentistProfilePayload = {
      specialties: form.specialties,
      bio: form.bio.trim() || null,
      // Empty = let the server pick the next palette colour (create only).
      ...(form.calendarColor ? { calendarColor: form.calendarColor } : {}),
    };
    onSubmit(
      isAdmin
        ? {
            ...self,
            licenseNumber: form.licenseNumber.trim() || null,
            licenseIssuedAt: form.licenseIssuedAt || null,
            defaultSlotMinutes: Number(form.defaultSlotMinutes),
            acceptsOnlineBooking: form.acceptsOnlineBooking,
            acceptsNewPatients: form.acceptsNewPatients,
          }
        : self,
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('uiWorkforce.licenseNumber')}
            value={form.licenseNumber}
            onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
            maxLength={50}
          />
          <DatePicker
            label={t('uiWorkforce.licenseIssuedAt')}
            value={form.licenseIssuedAt}
            onChange={(value) => setForm({ ...form, licenseIssuedAt: value })}
          />
        </div>
      )}

      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-gray-700 dark:text-surface-200">
          {t('uiWorkforce.specialties')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SPECIALTY_LABEL).map(([code, label]) => {
            const selected = form.specialties.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleSpecialty(code)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selected
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800',
                )}
              >
                {t(`uiWorkforce.specialty_${code}`, { defaultValue: label })}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-gray-700 dark:text-surface-200">
          {t('uiWorkforce.calendarColor')}
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          {CALENDAR_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={t('uiWorkforce.chooseCalendarColor', { color })}
              aria-pressed={form.calendarColor.toUpperCase() === color}
              onClick={() => setForm({ ...form, calendarColor: color })}
              className={cn(
                'h-7 w-7 rounded-full ring-offset-2 transition',
                form.calendarColor.toUpperCase() === color && 'ring-2 ring-gray-900 dark:ring-white',
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          {!initial?.calendarColor && !form.calendarColor && (
            <span className="text-xs text-gray-500 dark:text-surface-400">{t('uiWorkforce.calendarColorAuto')}</span>
          )}
        </div>
      </fieldset>

      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('uiWorkforce.defaultSlotDuration')}
            value={form.defaultSlotMinutes}
            onChange={(e) => setForm({ ...form, defaultSlotMinutes: e.target.value })}
            options={slotOptions}
          />
          <div className="space-y-2 pt-1">
            <Checkbox
            label={t('uiWorkforce.acceptsNewPatients')}
              checked={form.acceptsNewPatients}
              onChange={(checked) => setForm({ ...form, acceptsNewPatients: checked })}
            />
            <Checkbox
            label={t('uiWorkforce.acceptsOnlineBooking')}
              checked={form.acceptsOnlineBooking}
              onChange={(checked) => setForm({ ...form, acceptsOnlineBooking: checked })}
            />
          </div>
        </div>
      )}

      <Textarea
        label={t('uiWorkforce.dentistBio')}
        value={form.bio}
        onChange={(e) => setForm({ ...form, bio: e.target.value })}
        rows={3}
        maxLength={2000}
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('uiWorkforce.cancel')}
        </Button>
        <Button type="submit" isLoading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
