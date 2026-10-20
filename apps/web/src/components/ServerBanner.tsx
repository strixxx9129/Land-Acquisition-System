import { useTranslation } from 'react-i18next';
import { useServerState } from '../lib/serverStatus';

/** Explains a cold start instead of leaving the user staring at a frozen page. */
export function ServerBanner() {
  const { t } = useTranslation();
  const state = useServerState();
  if (state === 'ok') return null;
  const waking = state === 'waking';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b px-4 py-3 text-sm ${waking ? 'border-accent-400 bg-amber-50 text-ink' : 'border-danger bg-red-50 text-danger'}`}
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        {waking && <span className="mt-1 inline-block size-3 shrink-0 animate-pulse rounded-full bg-accent-400" aria-hidden="true" />}
        <p>
          <strong className="font-semibold">{waking ? t('server.wakingTitle') : t('server.downTitle')}</strong>{' '}
          {waking ? t('server.wakingBody') : t('server.downBody')}
        </p>
      </div>
    </div>
  );
}
