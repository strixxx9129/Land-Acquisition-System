import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api';

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const message = error instanceof Error && error.message ? error.message : t('errors.generic');
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div role="alert" className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">
      <p>{message}</p>
      {requestId && <p className="mt-1 text-xs opacity-80">{t('common.requestId', { id: requestId })}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return (
    <p role="status" className="p-6 text-ink-muted">
      {t('common.loading')}
    </p>
  );
}
