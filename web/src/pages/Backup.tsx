import { useRef, useState } from 'react';
import { settlePerson } from '../shared-vendor/index.ts';
import type { AllData } from '../lib/db';
import { fmt } from '../lib/types';
import { useLang } from '../i18n';

interface Props {
  data: AllData;
  onExport: () => void;
  onImportFile: (f: File) => Promise<{ added: number; updated: number; skipped: number }>;
  onLoadFixture: () => void;
}

export default function BackupPage(p: Props) {
  const { t } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [verify, setVerify] = useState<string | null>(null);

  const runVerify = () => {
    const day = '2024-04-11';
    const lucky = new Map(p.data.lucky.map((l) => [`${l.betDay}|${l.session}`, l.no]));
    const check = (sess: 'AM' | 'PM', expAmount: number, expWin: number, expNet: number) => {
      const rows = p.data.details.filter((d) => d.side === 'bet' && d.betDay === day && d.session === sess && d.personNo === '12');
      const s = settlePerson(
        rows.map((r) => ({ no: r.no, amount: r.amount })),
        lucky.get(`${day}|${sess}`) ?? null,
        15,
        80,
      );
      const ok = s.amount === expAmount && s.winAmt === expWin && s.netAmount === expNet;
      return t('backup.verifyLine', {
        sess,
        a: fmt(s.amount),
        ea: fmt(expAmount),
        w: fmt(s.winAmt),
        ew: fmt(expWin),
        n: fmt(s.netAmount),
        en: fmt(expNet),
        result: ok ? t('backup.verifyOk') : t('backup.verifyMismatch'),
      });
    };
    const drawAM = lucky.get(`${day}|AM`);
    const drawPM = lucky.get(`${day}|PM`);
    setVerify(
      `${t('backup.verifyHeader')}\n${t('backup.verifyDraws', { am: drawAM ?? '—', pm: drawPM ?? '—' })}\n${check('AM', 55000, 0, 46750)}\n${check('PM', 51950, 250, 24157.5)}`,
    );
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">{t('backup.title')}</h2>
        <p className="text-sm text-slate-500">{t('backup.note')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={p.onExport} className="btn btn-primary">
            {t('backup.export')}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-dark">
            {t('backup.import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const r = await p.onImportFile(f);
                setMsg(t('backup.importDone', { added: r.added, updated: r.updated, skipped: r.skipped }));
              } catch {
                setMsg(t('backup.importFailed'));
              }
              e.target.value = '';
            }}
          />
        </div>
        {msg && <p className="mt-2 text-sm text-slate-700">{msg}</p>}
        <p className="mt-3 text-sm text-slate-500">
          {t('backup.currentData', {
            details: p.data.details.length,
            codes: p.data.codes.length,
            lucky: p.data.lucky.length,
            people: p.data.people.length,
          })}
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">{t('backup.fixtureTitle')}</h2>
        <p className="text-sm text-slate-500">{t('backup.fixtureNote')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={p.onLoadFixture} className="btn btn-amber">
            {t('backup.loadFixture')}
          </button>
          <button type="button" onClick={runVerify} className="btn btn-ghost">
            {t('backup.verify')}
          </button>
        </div>
        {verify && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-100 p-2 text-sm">{verify}</pre>}
      </section>
    </div>
  );
}
