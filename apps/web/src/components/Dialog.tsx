import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Native <dialog>: focus trapping, Esc to close and inert background come from the browser. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <button type="button" onClick={onClose} className="rounded px-2 text-xl leading-none text-ink-muted hover:text-ink" aria-label={t('common.close')}>
          ×
        </button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto px-5 py-4">{open && children}</div>
    </dialog>
  );
}
