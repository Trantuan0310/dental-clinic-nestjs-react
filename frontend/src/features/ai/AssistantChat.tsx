import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { useAssistantStore } from '@/stores/assistantStore';
import { aiAssistApi, type AssistantCard, type AssistantReply, type ChatTurn } from './aiAssistApi';

/** Same permissions the endpoint accepts: the button only shows to those who can use it. */
const CHAT_PERMISSIONS = ['patient.read', 'appointment.read.any', 'treatment_plan.read', 'invoice.read.any', 'invoice.read.own'];

interface Bubble {
  id: number;
  role: 'user' | 'assistant';
  /** What the model wrote (patients as [P1]); this is what goes back as history. */
  raw: string;
  source?: AssistantReply['source'];
  cards: AssistantCard[];
  /** Cards already confirmed, by index. */
  done: Set<number>;
}

const MAX_HISTORY = 12;
/** "[P1]" → the name the browser learned for it; an unknown ref stays as is. */
const fill = (text: string, names: Record<string, string>) =>
  text.replace(/\[(P\d{1,3})\]/g, (_, ref: string) => names[ref] ?? ref);

/**
 * The clinic assistant: a chat that looks things up and prepares an
 * appointment, but books only when the user presses Confirm on the card. The
 * model never receives patient names: it sees refs (P1, P2…) and the names are
 * filled in here, in the browser.
 */
export function AssistantChat() {
  const { t } = useTranslation();
  const allowed = useAuthStore((s) => s.hasAnyPermission(CHAT_PERMISSIONS));
  const canBook = useAuthStore((s) => s.hasPermission('appointment.create'));
  const qc = useQueryClient();
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const [input, setInput] = useState('');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [bubbles, open]);

  const send = useMutation({
    mutationFn: (history: ChatTurn[]) => aiAssistApi.assistantChat(history, refs),
    onSuccess: (res) => {
      setRefs(res.refs);
      setNames((n) => ({ ...n, ...res.names }));
      setBubbles((b) => [...b, { id: nextId.current++, role: 'assistant', raw: res.reply, source: res.source, cards: res.actions, done: new Set() }]);
    },
    onError: (err) => {
      setBubbles((b) => [...b, { id: nextId.current++, role: 'assistant', raw: getApiErrorMessage(err, t('uiAi.assistant.error')), cards: [], done: new Set() }]);
    },
  });

  const confirm = useMutation({
    mutationFn: ({ card }: { card: AssistantCard; bubbleId: number; index: number }) => aiAssistApi.confirmAppointment(card.payload),
    onSuccess: (_res, { bubbleId, index }) => {
      setBubbles((all) => all.map((b) => (b.id === bubbleId ? { ...b, done: new Set(b.done).add(index) } : b)));
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      notify.success(t('uiAi.assistant.booked'));
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiAi.assistant.bookError'))),
  });

  if (!allowed) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || send.isPending) return;
    const next: Bubble[] = [...bubbles, { id: nextId.current++, role: 'user', raw: text, cards: [], done: new Set() }];
    setBubbles(next);
    setInput('');
    send.mutate(next.slice(-MAX_HISTORY).map((b) => ({ role: b.role, content: b.raw })));
  };

  const reset = () => {
    setBubbles([]);
    setRefs({});
    setNames({});
  };

  const examples = ['example4', 'example5', 'example1', 'example2', 'example3'].map((k) => t(`uiAi.assistant.${k}`));

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label={t('uiAi.assistant.title')}
          data-testid="assistant-panel"
          className="fixed bottom-4 right-4 z-40 flex h-[min(36rem,calc(100vh-2rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900"
        >
          <header className="flex items-center justify-between border-b border-surface-200 px-3 py-2 dark:border-surface-700">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary-600" aria-hidden="true" />
              {t('uiAi.assistant.title')}
            </div>
            <div className="flex items-center gap-1">
              {bubbles.length > 0 && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  {t('uiAi.assistant.reset')}
                </Button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label={t('uiAi.assistant.close')} className="rounded p-1 hover:bg-surface-100 dark:hover:bg-surface-800">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm" aria-live="polite">
            {bubbles.length === 0 && (
              <div className="space-y-2 text-surface-600 dark:text-surface-300">
                <p>{t('uiAi.assistant.intro')}</p>
                <ul className="space-y-1">
                  {examples.map((ex) => (
                    <li key={ex}>
                      <button type="button" onClick={() => setInput(ex)} className="rounded-md border border-surface-200 px-2 py-1 text-left hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800">
                        {ex}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {bubbles.map((b) => (
              <div key={b.id} className={b.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={b.role === 'user' ? 'max-w-[85%] rounded-lg bg-primary-600 px-3 py-2 text-white' : 'max-w-[92%] space-y-2'}>
                  {b.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{b.raw}</p>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap rounded-lg bg-surface-100 px-3 py-2 dark:bg-surface-800" data-testid="assistant-reply">
                        {b.source === 'fallback' && (
                          <span className="mb-1 block text-xs font-semibold">{t('uiAi.assistant.templateReply')}</span>
                        )}
                        {fill(b.raw, names)}
                      </p>
                      {b.cards.map((card, i) => (
                        <div key={i} className="rounded-lg border border-primary-200 bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-950" data-testid="assistant-card">
                          <p className="flex items-center gap-1 font-medium">
                            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                            {t('uiAi.assistant.cardTitle')}
                          </p>
                          <dl className="mt-1 space-y-0.5 text-xs">
                            <div><dt className="inline text-surface-500">{t('uiAi.assistant.patient')}: </dt><dd className="inline">{fill(`[${card.view.patientRef}]`, names)}</dd></div>
                            <div><dt className="inline text-surface-500">{t('uiAi.assistant.dentist')}: </dt><dd className="inline">{card.view.dentistName}</dd></div>
                            <div><dt className="inline text-surface-500">{t('uiAi.assistant.time')}: </dt><dd className="inline">{formatDateTime(card.view.startAt)}</dd></div>
                            {card.view.reason && <div><dt className="inline text-surface-500">{t('uiAi.assistant.reason')}: </dt><dd className="inline">{card.view.reason}</dd></div>}
                          </dl>
                          {b.done.has(i) ? (
                            <p className="mt-2 text-xs font-medium text-success-700 dark:text-success-400">{t('uiAi.assistant.booked')}</p>
                          ) : canBook ? (
                            <Button size="sm" className="mt-2" isLoading={confirm.isPending && confirm.variables?.bubbleId === b.id && confirm.variables?.index === i} onClick={() => confirm.mutate({ card, bubbleId: b.id, index: i })}>
                              {t('uiAi.assistant.confirm')}
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            ))}
            {send.isPending && <p className="text-xs text-surface-500">{t('uiAi.assistant.thinking')}</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="border-t border-surface-200 p-2 dark:border-surface-700">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={1000}
                placeholder={t('uiAi.assistant.placeholder')}
                aria-label={t('uiAi.assistant.placeholder')}
                data-testid="assistant-input"
                className="min-w-0 flex-1 rounded-md border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-600 dark:bg-surface-800"
              />
              <Button type="submit" size="sm" isDisabled={!input.trim() || send.isPending} aria-label={t('uiAi.assistant.send')}>
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-surface-500">{t('uiAi.assistant.notice')}</p>
          </form>
        </section>
      )}
    </>
  );
}

/** The header button that opens the assistant; shown only to users who can use it. */
export function AssistantButton() {
  const { t } = useTranslation();
  const allowed = useAuthStore((s) => s.hasAnyPermission(CHAT_PERMISSIONS));
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  if (!allowed) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-pressed={open}
      aria-label={t('uiAi.assistant.open')}
      title={t('uiAi.assistant.open')}
      data-testid="assistant-open"
      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary-700 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-surface-800"
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      <span className="hidden lg:inline">{t('uiAi.assistant.open')}</span>
    </button>
  );
}
