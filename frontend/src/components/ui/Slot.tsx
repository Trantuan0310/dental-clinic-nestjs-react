import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

interface SlotProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): Ref<T> {
  return (value: T | null) => {
    for (const r of refs) {
      if (!r) continue;
      if (typeof r === 'function') r(value);
      else (r as { current: T | null }).current = value;
    }
  };
}

/**
 * Minimal Slot implementation (Radix-style).
 * When a component uses <Slot>, its props/className/style/ref merge onto its
 * SINGLE child element — so <Button asChild><Link/></Button> renders a styled
 * <a> instead of a <button><a/></button>.
 */
export const Slot = forwardRef<HTMLElement, SlotProps>((props, forwardedRef) => {
  const { children, ...slotProps } = props;
  const child = Children.toArray(children).find(isValidElement) as
    | ReactElement<HTMLAttributes<HTMLElement>>
    | undefined;

  if (!child) return null;

  const childProps = (child.props ?? {}) as HTMLAttributes<HTMLElement>;
  const childRef = (child as unknown as { ref?: Ref<HTMLElement> }).ref;
  const childClassName = childProps.className;
  const slotClassName = slotProps.className;

  let mergedClassName: string | undefined;
  if (slotClassName && childClassName) {
    mergedClassName = `${slotClassName} ${childClassName}`;
  } else {
    mergedClassName = slotClassName ?? childClassName;
  }

  const mergedProps: HTMLAttributes<HTMLElement> = {
    ...slotProps,
    ...childProps,
    className: mergedClassName,
    style: { ...(slotProps.style ?? {}), ...(childProps.style ?? {}) },
  };

  return cloneElement(child, {
    ...mergedProps,
    ref: mergeRefs(forwardedRef, childRef),
  } as Record<string, unknown>);
});

Slot.displayName = 'Slot';
