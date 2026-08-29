import { cn } from '@/lib/cn';
import { createContext, useCallback, useContext, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  /** Stable id generator shared by all triggers/panels in this Tabs tree. */
  baseId: string;
  /** Move keyboard focus among triggers in this group. */
  focusTrigger: (delta: -1 | 1) => void;
  /** Register a trigger so we can move focus between them via arrow keys. */
  registerTrigger: (id: string, el: HTMLButtonElement | null) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export interface TabItem {
  id: string;
  label: ReactNode;
}

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onChange?: (value: string) => void;
  tabs?: TabItem[];
  children?: ReactNode;
  className?: string;
  /** Accessible label for the tablist. Required when there are multiple Tabs on a page. */
  'aria-label'?: string;
}

export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  onChange,
  tabs,
  children,
  className,
  'aria-label': ariaLabel,
}: TabsProps) {
  const resolvedDefault = defaultValue ?? tabs?.[0]?.id ?? '';
  const [internalValue, setInternalValue] = useState(resolvedDefault);
  const value = controlledValue ?? internalValue;
  const baseId = useId();

  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const registerTrigger = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) triggerRefs.current.set(id, el);
    else triggerRefs.current.delete(id);
  }, []);

  const focusTrigger = useCallback((delta: -1 | 1) => {
    const ids = tabs ? tabs.map((t) => t.id) : Array.from(triggerRefs.current.keys());
    if (ids.length === 0) return;
    const idx = ids.indexOf(value);
    const next = (idx + delta + ids.length) % ids.length;
    const el = triggerRefs.current.get(ids[next]);
    el?.focus();
  }, [tabs, value]);

  const handleChange = (newValue: string) => {
    setInternalValue(newValue);
    onValueChange?.(newValue);
    onChange?.(newValue);
  };

  return (
    <TabsContext.Provider
      value={{ value, onChange: handleChange, baseId, focusTrigger, registerTrigger }}
    >
      <div className={cn('w-full', className)}>
        {tabs ? (
          <>
            <TabsList aria-label={ariaLabel}>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {children}
          </>
        ) : (
          children
        )}
      </div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export function TabsList({ children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }: TabsListProps) {
  const context = useContext(TabsContext);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      context?.focusTrigger(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      context?.focusTrigger(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const first = (e.currentTarget.querySelector<HTMLButtonElement>('[role="tab"]'));
      first?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const all = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      all[all.length - 1]?.focus();
    }
  };

  return (
    <div
      className={cn(
        'inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-surface-800',
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function TabsTrigger({ value, children, disabled, className }: TabsTriggerProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used within Tabs');

  const isActive = context.value === value;
  const triggerId = `${context.baseId}-trigger-${value}`;
  const panelId = `${context.baseId}-panel-${value}`;

  return (
    <button
      ref={(el) => context.registerTrigger(value, el)}
      id={triggerId}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => context.onChange(value)}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface-900',
        'disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? 'bg-white text-gray-900 shadow-sm dark:bg-surface-700 dark:text-surface-100'
          : 'text-gray-600 hover:bg-white/50 hover:text-gray-900 dark:text-surface-300 dark:hover:bg-surface-700/60 dark:hover:text-surface-100',
        className,
      )}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
  /** Render even when inactive (used for "forceMount" pattern in EncounterDetailPage). */
  forceMount?: boolean;
}

export function TabsContent({ value, children, className, forceMount = false }: TabsContentProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within Tabs');

  const isActive = context.value === value;
  if (!isActive && !forceMount) return null;

  const panelId = `${context.baseId}-panel-${value}`;
  const triggerId = `${context.baseId}-trigger-${value}`;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={triggerId}
      // When forceMount is on, keep the panel hidden but present in the DOM
      // so screen readers don't lose context when the user is offline-editing.
      hidden={!isActive}
      tabIndex={0}
      className={cn('mt-4 animate-in fade-in duration-200', className)}
    >
      {children}
    </div>
  );
}