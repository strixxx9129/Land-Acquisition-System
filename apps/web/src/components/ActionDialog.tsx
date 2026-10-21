import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api';
import type { CaseAction } from '../lib/types';
import { useText } from '../lib/useText';
import { Dialog } from './Dialog';
import { ErrorNotice } from './ErrorNotice';

interface Props {
  action: CaseAction | null;
  /** Earliest allowed official date: the day the case reached its current stage. */
  minDate?: string;
  onClose: () => void;
  onSubmit: (payload: { action: string; remarks?: string; inputs: Record<string, unknown> }) => Promise<void>;
}

/** The form for one workflow action. Its fields come from the workflow definition, not from code. */
export function ActionDialog({ action, minDate, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const text = useText();
  const [values, setValues] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const close = () => {
    setValues({});
    setRemarks('');
    setError(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!action) return;
    setPending(true);
    setError(null);
    try {
      const inputs: Record<string, unknown> = {};
      for (const input of action.inputs) {
        const v = values[input.key]?.trim();
        if (v) inputs[input.key] = input.type === 'number' ? Number(v) : v;
      }
      await onSubmit({ action: action.action, remarks: remarks.trim() || undefined, inputs });
      close();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const danger = action?.kind === 'REJECT';
  const details = error instanceof ApiError && Array.isArray(error.details) ? (error.details as { path: string; message: string }[]) : [];

  return (
    <Dialog open={!!action} onClose={close} title={action ? text(action.label) : ''}>
      {action && (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <p className="text-sm text-ink-muted">{t('action.moves', { stage: text(action.to.name) })}</p>
          {action.inputs.map((input) => (
            <div key={input.key}>
              <label htmlFor={`in-${input.key}`} className="block text-sm font-medium">
                {text(input.label)}
                {input.required && <span className="text-danger"> *</span>}
              </label>
              {input.type === 'textarea' ? (
                <textarea
                  id={`in-${input.key}`}
                  rows={3}
                  required={input.required}
                  value={values[input.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [input.key]: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-line px-3 py-2"
                />
              ) : (
                <input
                  id={`in-${input.key}`}
                  type={input.type === 'number' ? 'number' : input.type === 'date' ? 'date' : 'text'}
                  inputMode={input.type === 'number' ? 'decimal' : undefined}
                  step={input.type === 'number' ? 'any' : undefined}
                  min={input.type === 'date' ? minDate : input.min}
                  max={input.type === 'date' ? today : input.max}
                  required={input.required}
                  value={values[input.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [input.key]: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-line px-3 py-2"
                />
              )}
              {details.find((d) => d.path === input.key) && <p className="mt-1 text-xs text-danger">{details.find((d) => d.path === input.key)!.message}</p>}
            </div>
          ))}
          <div>
            <label htmlFor="remarks" className="block text-sm font-medium">
              {t('action.remarks')}
              {action.requiresRemarks ? <span className="text-danger"> *</span> : <span className="font-normal text-ink-muted"> ({t('action.optional')})</span>}
            </label>
            <textarea id="remarks" rows={3} required={action.requiresRemarks} value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 w-full rounded-md border border-line px-3 py-2" />
          </div>
          {error != null && <ErrorNotice error={error} />}
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={close} className="rounded-md border border-line px-4 py-2 text-sm">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={pending}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${danger ? 'bg-danger hover:opacity-90' : 'bg-brand-700 hover:bg-brand-800'}`}
            >
              {pending ? t('common.saving') : t('action.confirm')}
            </button>
          </div>
          <p className="text-xs text-ink-muted">{t('action.recordedNote')}</p>
        </form>
      )}
    </Dialog>
  );
}
