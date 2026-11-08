import { useState } from 'react';
import { reverseNo } from '../shared-vendor/index.ts';
import type { Lucky } from '../lib/db';
import { useLang } from '../i18n';

interface Props {
  betDay: string;
  session: 'AM' | 'PM';
  current: Lucky | null;
  all: Lucky[];
  onSave: (no: string) => void;
  onOldNumbers: (amount: string) => void;
}

export default function LuckyPage(p: Props) {
  const { t } = useLang();
  const [no, setNo] = useState(p.current?.no ?? '');
  const [amt, setAmt] = useState('1000');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const rev = /^\d{2}$/.test(no) ? reverseNo(no) : '—';

  const save = () => {
    // FIX vs the original: the original had no numeric/length validation
    // and a 1-char entry would crash on Substring(1,1). Exactly 2 digits.
    if (!/^\d{2}$/.test(no)) {
      setError(t('lucky.error'));
      return;
    }
    setError('');
    p.onSave(no);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const sorted = [...p.all].sort((a, b) => `${b.betDay}|${b.session}`.localeCompare(`${a.betDay}|${a.session}`));

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">{t('lucky.title')}</h2>
        <p className="text-sm text-slate-500">{t('lucky.note', { day: p.betDay, session: p.session })}</p>
        <div className="mt-3 flex gap-2">
          <input
            className="input w-32 py-3 text-center text-2xl font-bold tracking-widest"
            value={no}
            maxLength={2}
            inputMode="numeric"
            placeholder="--"
            onChange={(e) => {
              setNo(e.target.value.replace(/\D/g, '').slice(0, 2));
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
            {t('lucky.reverse')} <span className="text-lg font-bold">{rev}</span>
            <div className="text-xs text-slate-500">{t('lucky.reverseNote')}</div>
          </div>
          <button type="button" onClick={save} className="btn btn-primary px-5 py-3 text-lg">
            {t('lucky.save')}
          </button>
        </div>
        {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
        {saved && <p className="mt-2 text-sm font-medium text-green-600">{t('lucky.saved', { day: p.betDay, session: p.session })}</p>}
        {p.current && (
          <p className="mt-2 text-sm text-slate-600">
            {t('lucky.current')} <span className="text-lg font-bold text-slate-900">{p.current.no}</span>{' '}
            {t('lucky.currentReverse', { rev: p.current.noR })}
          </p>
        )}

        <h3 className="mt-5 text-base font-bold text-slate-800">{t('lucky.oldTitle')}</h3>
        <p className="text-sm text-slate-500">{t('lucky.oldNote')}</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            {t('lucky.oldAmountLabel')}
            <input
              className="input w-32 py-3 text-lg"
              value={amt}
              inputMode="numeric"
              onChange={(e) => setAmt(e.target.value)}
            />
          </label>
          <button type="button" onClick={() => p.onOldNumbers(amt)} className="btn btn-dark">
            {t('lucky.oldButton')}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">{t('lucky.pastTitle')}</h2>
        {sorted.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{t('lucky.pastEmpty')}</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-1">{t('lucky.colDate')}</th>
                <th>{t('lucky.colSession')}</th>
                <th>{t('lucky.colLuckyNo')}</th>
                <th>{t('lucky.colReverse')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr key={l.key} className="border-b">
                  <td className="py-1">{l.betDay}</td>
                  <td>{l.session}</td>
                  <td className="font-bold">{l.no}</td>
                  <td className="text-slate-500">{l.noR}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
