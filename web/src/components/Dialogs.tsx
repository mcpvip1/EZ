import { useEffect, useRef, useState } from 'react';
import type { DeleteScope } from '../lib/db';
import { deleteScope } from '../lib/db';
import { useLang } from '../i18n';

/**
 * Topmost-Esc stack: every modal/popup registers its onClose here, and a
 * single document listener (capture phase) closes only the topmost one.
 * That makes Esc close a nested confirm without also closing the dialog
 * underneath it, and close a popup before anything behind it.
 */
const escStack: Array<() => void> = [];
let escListenerAttached = false;

function useTopmostEsc(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const fn = () => ref.current();
    escStack.push(fn);
    if (!escListenerAttached) {
      escListenerAttached = true;
      document.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Escape') {
            const top = escStack[escStack.length - 1];
            if (top) {
              e.preventDefault();
              e.stopImmediatePropagation();
              top();
            }
          }
        },
        true,
      );
    }
    return () => {
      const i = escStack.indexOf(fn);
      if (i !== -1) escStack.splice(i, 1);
    };
  }, []);
}

export function Modal(p: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const { t } = useLang();
  useTopmostEsc(p.onClose);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-3 pt-16" onClick={p.onClose}>
      <div
        className={`max-h-[85vh] w-full overflow-y-auto rounded-lg border bg-white p-4 shadow-xl ${p.wide ? 'max-w-5xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{p.title}</h2>
          <button type="button" onClick={p.onClose} className="btn btn-ghost btn-sm" aria-label={t('dialog.close')}>
            ✕
          </button>
        </div>
        <div className="mt-3">{p.children}</div>
      </div>
    </div>
  );
}

/** Generic popup shell: content opens OVER the main screen (board stays mounted behind). */
export function PopupDialog(p: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <Modal title={p.title} onClose={p.onClose} wide={p.wide ?? true}>
      {p.children}
    </Modal>
  );
}

/**
 * In-app confirm dialog (replaces window.confirm, which the Space frame
 * suppresses). One click opens it, OK confirms, Esc / backdrop / Cancel
 * dismisses without doing anything.
 */
export function ConfirmDialog(p: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLang();
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
  }, []);
  return (
    <Modal title={p.title ?? t('dialog.confirmDefaultTitle')} onClose={p.onCancel}>
      <p className="text-sm text-slate-700">{p.message}</p>
      <div className="mt-4 flex gap-2">
        <button
          ref={okRef}
          type="button"
          onClick={p.onConfirm}
          className={`btn ${p.danger ? 'btn-danger' : 'btn-primary'}`}
        >
          {p.confirmLabel ?? t('dialog.confirmOk')}
        </button>
        <button type="button" onClick={p.onCancel} className="btn btn-ghost">
          {p.cancelLabel ?? t('dialog.confirmCancel')}
        </button>
      </div>
    </Modal>
  );
}

export function ChangeDateDialog(p: {
  betDay: string;
  session: 'AM' | 'PM';
  onApply: (betDay: string, session: 'AM' | 'PM') => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [day, setDay] = useState(p.betDay);
  const [sess, setSess] = useState<'AM' | 'PM'>(p.session);
  return (
    <Modal title={t('dialog.changeDate')} onClose={p.onClose}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-600">
          {t('dialog.changeDate.date')}
          <input type="date" className="input ml-2" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <div className="flex overflow-hidden rounded-lg border">
          {(['AM', 'PM'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSess(s)}
              className={`px-4 py-2 font-bold ${sess === s ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            if (day) p.onApply(day, sess);
          }}
          className="btn btn-primary"
        >
          {t('dialog.changeDate.apply')}
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-500">{t('dialog.changeDate.note')}</p>
    </Modal>
  );
}

const DELETE_SCOPES: { id: DeleteScope; key: string }[] = [
  { id: 'sales', key: 'dialog.delete.scope.sales' },
  { id: 'carry', key: 'dialog.delete.scope.carry' },
  { id: 'salesCarryLucky', key: 'dialog.delete.scope.salesCarryLucky' },
  { id: 'lucky', key: 'dialog.delete.scope.lucky' },
  { id: 'fighter', key: 'dialog.delete.scope.fighter' },
  { id: 'owner', key: 'dialog.delete.scope.owner' },
  { id: 'all', key: 'dialog.delete.scope.all' },
];

export function DeleteDialog(p: { betDay: string; onDone: (msg: string) => void; onClose: () => void }) {
  const { t } = useLang();
  const [day, setDay] = useState(p.betDay);
  const [mode, setMode] = useState<'upto' | 'from'>('upto');
  const [scope, setScope] = useState<DeleteScope>('sales');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <Modal title={t('dialog.delete')} onClose={p.onClose}>
      <p className="text-sm text-red-700">{t('dialog.delete.warn')}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-600">
          {t('dialog.delete.date')}
          <input type="date" className="input ml-2" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <div className="flex overflow-hidden rounded-lg border">
          {(['upto', 'from'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-2 font-bold ${mode === m ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
            >
              {t(m === 'upto' ? 'dialog.delete.upTo' : 'dialog.delete.from')}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1">
        {DELETE_SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScope(s.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm font-bold ${scope === s.id ? 'border-red-500 bg-red-50 text-red-700' : 'bg-white text-slate-700'}`}
          >
            {t(s.key)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="btn btn-danger">
          {t('dialog.delete.deleteBtn')}
        </button>
        <button type="button" onClick={p.onClose} className="btn btn-ghost">
          {t('dialog.delete.closeBtn')}
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t('dialog.delete.confirmTitle')}
          message={t('dialog.delete.confirmMsg')}
          confirmLabel={t('dialog.delete.yesDelete')}
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            setConfirming(false);
            setBusy(true);
            const n = await deleteScope(day, mode, scope);
            setBusy(false);
            p.onDone(t('dialog.delete.done', { n }));
            // Single confirm: the dialog closes after deleting.
            p.onClose();
          }}
        />
      )}
    </Modal>
  );
}

/**
 * Limit / Calc popup (D12 + D13). The original kept the limit box hidden
 * and only wrote it into Calc after an "Are You Sure to Save?" confirm
 * (txtLimit_KeyDown, MDIMain.cs:8510); the global commission % and rate
 * (txtPercent / txtRate, same update) were editable there too. Nothing
 * persists on keystroke — Apply asks once, then saves all three values.
 */
export function CalcDialog(p: {
  limit: number;
  commission: number;
  rate: number;
  onApply: (limit: number, commission: number, rate: number) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [limit, setLimit] = useState(String(p.limit));
  const [commission, setCommission] = useState(String(p.commission));
  const [rate, setRate] = useState(String(p.rate));
  const [confirming, setConfirming] = useState(false);
  const valid = limit.trim() !== '' && commission.trim() !== '' && rate.trim() !== '';
  return (
    <Modal title={t('dialog.calc')} onClose={p.onClose}>
      <p className="text-sm text-slate-500">{t('dialog.calc.note')}</p>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="text-sm font-medium text-slate-600">
          {t('dialog.calc.limit')}
          <input
            type="number"
            className="input-yellow ml-2 w-28"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            aria-label={t('dialog.calc.limit')}
          />
        </label>
        <label className="text-sm font-medium text-slate-600">
          {t('dialog.calc.commission')}
          <input
            type="number"
            className="input ml-2 w-24 py-2 text-base font-bold"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            aria-label={t('dialog.calc.commission')}
          />
        </label>
        <label className="text-sm font-medium text-slate-600">
          {t('dialog.calc.rate')}
          <input
            type="number"
            className="input ml-2 w-24 py-2 text-base font-bold"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            aria-label={t('dialog.calc.rate')}
          />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={!valid} onClick={() => setConfirming(true)} className="btn btn-primary">
          {t('dialog.calc.save')}
        </button>
        <button type="button" onClick={p.onClose} className="btn btn-ghost">
          {t('dialog.calc.cancel')}
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t('dialog.calc.confirmTitle')}
          message={t('dialog.calc.confirmMsg')}
          confirmLabel={t('dialog.calc.yesSave')}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            p.onApply(Number(limit) || 0, Number(commission) || 0, Number(rate) || 0);
            p.onClose();
          }}
        />
      )}
    </Modal>
  );
}

const CLOSED_KEY = 'easy2d-closedays';

export function CloseDaysDialog(p: { onClose: () => void }) {
  const { t } = useLang();
  const [days, setDays] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const [day, setDay] = useState('');
  const save = (next: string[]) => {
    setDays(next);
    localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
  };
  return (
    <Modal title={t('dialog.closeDays')} onClose={p.onClose}>
      <p className="text-sm text-slate-500">{t('dialog.closeDays.note')}</p>
      <div className="mt-3 flex gap-2">
        <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
        <button
          type="button"
          onClick={() => {
            if (day && !days.includes(day)) save([...days, day].sort());
          }}
          className="btn btn-primary"
        >
          {t('dialog.closeDays.save')}
        </button>
      </div>
      <ul className="mt-3 space-y-1">
        {days.length === 0 && <li className="text-sm text-slate-400">{t('dialog.closeDays.empty')}</li>}
        {days.map((d) => (
          <li key={d} className="flex items-center justify-between rounded border px-3 py-1 text-sm">
            <span>{d}</span>
            <button type="button" onClick={() => save(days.filter((x) => x !== d))} className="btn btn-danger btn-sm">
              {t('dialog.closeDays.delete')}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function AboutDialog(p: { onClose: () => void }) {
  const { t } = useLang();
  return (
    <Modal title={t('dialog.about')} onClose={p.onClose}>
      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{t('dialog.about.cheat')}</pre>
      <p className="mt-2 text-sm text-slate-500">{t('dialog.about.note')}</p>
    </Modal>
  );
}

export function HighlightDialog(p: { color: string; onApply: (c: string) => void; onClose: () => void }) {
  const { t } = useLang();
  const [c, setC] = useState(p.color);
  return (
    <Modal title={t('dialog.highlight')} onClose={p.onClose}>
      <p className="text-sm text-slate-500">{t('dialog.highlight.note')}</p>
      <div className="mt-3 flex items-center gap-3">
        <input type="color" value={c} onChange={(e) => setC(e.target.value)} className="h-12 w-16 cursor-pointer rounded border" aria-label={t('dialog.highlight.colorLabel')} />
        <span className="rounded px-3 py-2 font-mono text-sm" style={{ backgroundColor: c }}>
          {c}
        </span>
        <button
          type="button"
          onClick={() => {
            p.onApply(c);
            p.onClose();
          }}
          className="btn btn-primary"
        >
          {t('dialog.highlight.apply')}
        </button>
      </div>
    </Modal>
  );
}
