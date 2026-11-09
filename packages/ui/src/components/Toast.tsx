// Toast: short confirmations ("Draft saved", "Theme updated"). Errors use Notice instead.
import { X } from 'lucide-react';
import { Toast as RadixToast } from 'radix-ui';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cx } from '../cx';

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  tone: 'success' | 'info' | 'danger';
};
type ShowToast = (toast: Omit<ToastItem, 'id' | 'tone'> & { tone?: ToastItem['tone'] }) => void;

const ToastContext = createContext<ShowToast | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback<ShowToast>(
    (t) =>
      setItems((prev) => [
        ...prev,
        { id: prev.length + (prev.at(-1)?.id ?? 0) + 1, tone: t.tone ?? 'success', ...t },
      ]),
    [],
  );
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="down" duration={5000}>
        {children}
        {items.map((t) => (
          <RadixToast.Root
            key={t.id}
            onOpenChange={(open) => !open && setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className={cx(
              'flex items-start gap-3 rounded-lg border bg-surface p-4 shadow-pop',
              t.tone === 'danger' ? 'border-danger' : 'border-line',
            )}
          >
            <div className="min-w-0 flex-1">
              <RadixToast.Title className="text-body font-semibold text-ink">
                {t.title}
              </RadixToast.Title>
              {t.description ? (
                <RadixToast.Description className="text-body text-muted">
                  {t.description}
                </RadixToast.Description>
              ) : null}
            </div>
            <RadixToast.Close
              aria-label="Dismiss"
              className="inline-flex size-11 items-center justify-center rounded-md text-ink hover:bg-subtle"
            >
              <X size={20} aria-hidden="true" />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>.');
  return show;
}
