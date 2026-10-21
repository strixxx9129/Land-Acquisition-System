import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { daysSince } from '../lib/format';
import type { CaseSummary } from '../lib/types';
import { useText } from '../lib/useText';
import { DeadlineBadge, SlaBadge, StatusBadge } from './Badges';

/** Cases as a table on wide screens and stacked cards on phones. */
export function CaseTable({ items, showWaiting = false }: { items: CaseSummary[]; showWaiting?: boolean }) {
  const { t } = useTranslation();
  const text = useText();
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th scope="col" className="px-3 py-2">{t('cases.case')}</th>
              <th scope="col" className="px-3 py-2">{t('cases.location')}</th>
              <th scope="col" className="px-3 py-2">{t('cases.stage')}</th>
              <th scope="col" className="px-3 py-2">{showWaiting ? t('cases.waiting') : t('cases.status')}</th>
              <th scope="col" className="px-3 py-2">{t('cases.deadline')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-line align-top hover:bg-brand-50/40">
                <td className="px-3 py-2.5">
                  <Link to={`/cases/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.title}
                  </Link>
                  <span className="block font-mono text-xs text-ink-muted">{c.caseNumber}</span>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {text(c.district.name)}, {text(c.state.name)}
                  <span className="block text-ink-muted">{text(c.organization.name) || c.organization.code}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="block">{text(c.stage.name)}</span>
                  <span className="text-xs text-ink-muted">{text(c.workflowName)}</span>
                </td>
                <td className="px-3 py-2.5">
                  {showWaiting ? (
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-xs">{t('cases.daysAgo', { count: daysSince(c.stageEnteredAt) })}</span>
                      <SlaBadge sla={c.sla} />
                    </div>
                  ) : (
                    <StatusBadge status={c.status} />
                  )}
                </td>
                <td className="px-3 py-2.5">{c.nextDeadline ? <DeadlineBadge deadline={c.nextDeadline} withLabel /> : <span className="text-ink-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {items.map((c) => (
          <li key={c.id}>
            <Link to={`/cases/${c.id}`} className="block rounded-lg border border-line bg-surface p-3 hover:border-brand-600">
              <span className="block font-medium text-brand-700">{c.title}</span>
              <span className="block font-mono text-xs text-ink-muted">{c.caseNumber}</span>
              <span className="mt-1 block text-sm">{text(c.stage.name)}</span>
              <span className="block text-xs text-ink-muted">
                {text(c.district.name)} · {text(c.organization.name) || c.organization.code}
              </span>
              <span className="mt-2 flex flex-wrap gap-1">
                {showWaiting ? <SlaBadge sla={c.sla} /> : <StatusBadge status={c.status} />}
                {c.nextDeadline && <DeadlineBadge deadline={c.nextDeadline} withLabel />}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
