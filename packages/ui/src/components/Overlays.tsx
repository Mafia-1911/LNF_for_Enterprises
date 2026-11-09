// Overlays (Figma 36:313): every modal and bottom sheet sits on the scrim + 16 px soft blur.
import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '../cx';

const overlay = 'fixed inset-0 z-40 bg-scrim backdrop-blur-[16px]';

export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One or two sentences under the title, read by screen readers as the description. */
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onOpenChange, title, children, footer }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-6 py-[18px]">
            <Dialog.Title className="text-heading-m font-bold text-ink">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="inline-flex size-11 items-center justify-center rounded-md text-ink hover:bg-subtle"
            >
              <X size={22} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description asChild>
            <div className="p-6 text-body text-ink">{children}</div>
          </Dialog.Description>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content
          className={cx(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-[560px] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-surface px-5 pt-3 pb-6 shadow-pop',
          )}
        >
          <span aria-hidden="true" className="mx-auto h-[5px] w-11 rounded-full bg-line" />
          <div className="flex flex-col gap-2">
            <Dialog.Title className="text-heading-m font-bold text-ink">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="text-body text-muted">
                {description}
              </Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const DialogClose = Dialog.Close;
