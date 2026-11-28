import i18n from 'i18next';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The message for the first failed constraint, in the app's language. */
export function nativeValidationMessage(el: Field): string {
  const v = el.validity;
  const k = (key: string, o?: Record<string, unknown>) => i18n.t(`uiCommon.nativeValidation.${key}`, o);
  if (v.valueMissing) {
    if (el instanceof HTMLSelectElement) return k('valueMissingSelect');
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return k('valueMissingCheck');
    return k('valueMissing');
  }
  if (v.typeMismatch) return el instanceof HTMLInputElement && el.type === 'email' ? k('typeMismatchEmail') : k('typeMismatch');
  if (v.tooShort && 'minLength' in el) return k('tooShort', { min: el.minLength, len: el.value.length });
  if (v.tooLong && 'maxLength' in el) return k('tooLong', { max: el.maxLength });
  if (v.rangeUnderflow && el instanceof HTMLInputElement) return k('rangeUnderflow', { min: el.min });
  if (v.rangeOverflow && el instanceof HTMLInputElement) return k('rangeOverflow', { max: el.max });
  if (v.stepMismatch) return k('stepMismatch');
  if (v.patternMismatch) return el.title || k('patternMismatch');
  if (v.badInput) return k('badInput');
  return '';
}

const isField = (t: EventTarget | null): t is Field =>
  t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;

/**
 * The browser's own bubble ("Please fill out this field.") follows the
 * browser's language, not the app's, so a Vietnamese form could answer in
 * English. Replace it with our message whenever a field is reported invalid,
 * and clear it as soon as the value changes so the field can become valid.
 */
export function installNativeValidationMessages(doc: Document = document): void {
  doc.addEventListener(
    'invalid',
    (e) => {
      const el = e.target;
      if (!isField(el)) return;
      el.setCustomValidity('');
      if (!el.validity.valid) el.setCustomValidity(nativeValidationMessage(el));
    },
    true,
  );
  const clear = (e: Event) => {
    if (isField(e.target)) e.target.setCustomValidity('');
  };
  doc.addEventListener('input', clear, true);
  doc.addEventListener('change', clear, true);
  // A value set from code (a picker, a reset) fires no input event: clear the
  // whole form just before the browser validates it, so a stale message can
  // never block a submit.
  const clearForm = (form: HTMLFormElement | null | undefined) => {
    if (!form) return;
    for (const el of Array.from(form.elements)) if (isField(el)) el.setCustomValidity('');
  };
  doc.addEventListener(
    'click',
    (e) => {
      const b = e.target instanceof Element ? e.target.closest('button, input[type="submit"]') : null;
      if (b instanceof HTMLButtonElement || b instanceof HTMLInputElement) {
        if (b.type === 'submit') clearForm(b.form);
      }
    },
    true,
  );
  doc.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement) clearForm(e.target.form);
    },
    true,
  );
}
