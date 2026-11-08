import { useRef, useState } from 'react';
import type { Person } from '../lib/db';
import { ConfirmDialog } from '../components/Dialogs';
import { useLang } from '../i18n';

interface Props {
  people: Person[];
  /** When set (Setup → Fighter / Owner), show only that side — the original opens separate forms. */
  focus?: 'fighter' | 'owner';
  onSave: (p: Person) => void;
  onAdd: (side: 'fighter' | 'owner', no: string, commission: number, rate: number) => string | null;
  onDelete: (id: string) => void;
}

function List(p: { title: string; side: 'fighter' | 'owner'; people: Person[]; onSave: (x: Person) => void; onAdd: Props['onAdd']; onDelete: (id: string) => void }) {
  const { t } = useLang();
  const [no, setNo] = useState('');
  const [com, setCom] = useState(p.side === 'fighter' ? 15 : 14);
  const [rate, setRate] = useState(80);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState<Person | null>(null);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);
  const list = p.people.filter((x) => x.side === p.side);

  // Inline edits save on every keystroke; flash a brief "Saved" chip
  // near the title so the operator gets feedback (F10).
  const inlineSave = (x: Person) => {
    p.onSave(x);
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 1500);
  };

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-slate-800">{p.title}</h2>
        {flash && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700" role="status">
            {t('people.savedFlash')}
          </span>
        )}
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="py-1">{t('people.colNo')}</th>
            <th>{t('people.colName')}</th>
            <th>{t('people.colCom')}</th>
            <th>{t('people.colRate')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((x) => (
            <tr key={x.id} className="border-b">
              <td className="py-1 font-bold">{x.no}</td>
              <td>
                <input
                  className="input w-24 px-2 py-1"
                  value={x.name}
                  placeholder={t('people.namePlaceholder')}
                  onChange={(e) => inlineSave({ ...x, name: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  className="input w-20 px-2 py-1"
                  value={x.commission}
                  onChange={(e) => inlineSave({ ...x, commission: Number(e.target.value) || 0 })}
                />
              </td>
              <td>
                <input
                  type="number"
                  className="input w-20 px-2 py-1"
                  value={x.rate}
                  onChange={(e) => inlineSave({ ...x, rate: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="text-right">
                <button type="button" onClick={() => setConfirmDel(x)} className="btn btn-danger btn-sm">
                  {t('people.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="input w-24" placeholder={t('people.newNo')} value={no} onChange={(e) => setNo(e.target.value)} />
        <label className="flex items-center gap-1 text-sm">
          {t('people.comShort')}
          <input type="number" className="input w-20" value={com} onChange={(e) => setCom(Number(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-1 text-sm">
          {t('people.rate')}
          <input type="number" className="input w-20" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} />
        </label>
        <button
          type="button"
          onClick={() => {
            const e = p.onAdd(p.side, no.trim(), com, rate);
            if (e) setErr(e);
            else {
              setErr('');
              setNo('');
            }
          }}
          className="btn btn-primary"
        >
          {t('people.add')}
        </button>
      </div>
      {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
      {confirmDel && (
        <ConfirmDialog
          title={t('people.deleteTitle', { side: t(p.side === 'fighter' ? 'entry.fighter' : 'entry.owner'), no: confirmDel.no })}
          message={t('people.deleteMsg')}
          confirmLabel={t('people.yesDelete')}
          danger
          onConfirm={() => {
            p.onDelete(confirmDel.id);
            setConfirmDel(null);
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </section>
  );
}

export default function PeoplePage(p: Props) {
  const { t } = useLang();
  if (p.focus) {
    return (
      <div className="grid gap-3">
        <List
          title={p.focus === 'fighter' ? t('people.fighters') : t('people.owners')}
          side={p.focus}
          people={p.people}
          onSave={p.onSave}
          onAdd={p.onAdd}
          onDelete={p.onDelete}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <List title={t('people.fighters')} side="fighter" people={p.people} onSave={p.onSave} onAdd={p.onAdd} onDelete={p.onDelete} />
      <List title={t('people.owners')} side="owner" people={p.people} onSave={p.onSave} onAdd={p.onAdd} onDelete={p.onDelete} />
      <p className="text-sm text-slate-500 lg:col-span-2">{t('people.note')}</p>
    </div>
  );
}
