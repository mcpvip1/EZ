import { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';

/**
 * Classic menu bar from the original EASY main screen:
 * Setup | Report | System | AUTO | OK Thanks | Close | Template | T =
 * Dropdowns open on click; clicking an item runs it and closes the menu.
 * Labels come from the locale files (Myanmar default); the language
 * itself is switched from the System menu (မြန်မာ / English).
 */

export interface MenuAction {
  kind:
    | 'lucky'
    | 'fighter'
    | 'owner'
    | 'delete'
    | 'changeDate'
    | 'unitSales'
    | 'closeDays'
    | 'about'
    | 'highlight'
    | 'backup'
    | 'browseBets'
    | 'reportCurrent'
    | 'reportDaily'
    | 'reportWeekly'
    | 'reportRange'
    | 'reportRangeAMPM'
    | 'reportSelected'
    | 'reportSelectedViewOnly'
    | 'reportUpToDate'
    | 'auto'
    | 'okThanks'
    | 'close'
    | 'template'
    | 'tEquals'
    | 'langMy'
    | 'langEn';
}

interface Item {
  key: string;
  shortcut?: string;
  action: MenuAction['kind'];
  checked?: boolean;
}

export default function MenuBar(p: {
  onAction: (a: MenuAction['kind']) => void;
  dateLabel: string;
  right?: React.ReactNode;
}) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const SETUP: Item[] = [
    { key: 'menu.setup.lucky', shortcut: 'Ctrl+L', action: 'lucky' },
    { key: 'menu.setup.fighter', shortcut: 'Ctrl+F', action: 'fighter' },
    { key: 'menu.setup.owner', shortcut: 'Ctrl+O', action: 'owner' },
    { key: 'menu.setup.delete', shortcut: 'Ctrl+D', action: 'delete' },
    { key: 'menu.setup.changeDate', shortcut: 'Ctrl+T', action: 'changeDate' },
    { key: 'menu.setup.unitSales', action: 'unitSales' },
    { key: 'menu.setup.closeDays', action: 'closeDays' },
  ];

  const REPORT: Item[] = [
    { key: 'menu.report.current', shortcut: 'F9', action: 'reportCurrent' },
    { key: 'menu.report.daily', shortcut: 'F10', action: 'reportDaily' },
    { key: 'menu.report.weekly', shortcut: 'F11', action: 'reportWeekly' },
    { key: 'menu.report.range', shortcut: 'F12', action: 'reportRange' },
    { key: 'menu.report.rangeAMPM', action: 'reportRangeAMPM' },
    { key: 'menu.report.selected', shortcut: 'F4', action: 'reportSelected' },
    { key: 'menu.report.selectedViewOnly', shortcut: 'Ctrl+F4', action: 'reportSelectedViewOnly' },
    { key: 'menu.report.upToDate', action: 'reportUpToDate' },
    { key: 'menu.report.browseBets', action: 'browseBets' },
  ];

  const SYSTEM: Item[] = [
    { key: 'menu.system.about', action: 'about' },
    { key: 'menu.system.highlight', action: 'highlight' },
    { key: 'menu.system.backup', action: 'backup' },
    { key: 'menu.lang.my', action: 'langMy', checked: lang === 'my' },
    { key: 'menu.lang.en', action: 'langEn', checked: lang === 'en' },
    { key: 'menu.system.exit', action: 'close' },
  ];

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const run = (action: MenuAction['kind']) => {
    setOpen(null);
    p.onAction(action);
  };

  const menu = (id: string, labelKey: string, items: Item[], bold?: boolean) => (
    <div className="relative" key={id}>
      <button
        type="button"
        onClick={() => setOpen(open === id ? null : id)}
        className={`btn btn-sm rounded px-2 ${bold ? 'font-extrabold' : 'font-medium'} ${open === id ? 'bg-slate-300' : ''}`}
      >
        {t(labelKey)}
      </button>
      {open === id && (
        <div className="absolute left-0 top-full z-30 min-w-56 rounded border border-slate-300 bg-white py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => run(it.action)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-indigo-50"
            >
              <span>
                {it.checked ? '✓ ' : ''}
                {t(it.key)}
              </span>
              {it.shortcut && <span className="text-xs text-slate-400">{it.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const single = (labelKey: string, action: MenuAction['kind'], bold?: boolean) => (
    <button
      key={labelKey}
      type="button"
      onClick={() => run(action)}
      className={`btn btn-sm rounded px-2 ${bold ? 'font-extrabold' : 'font-medium'}`}
    >
      {t(labelKey)}
    </button>
  );

  return (
    <div ref={ref} className="no-print border-b border-slate-300 bg-slate-100">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-0.5 px-2 py-1">
        {menu('setup', 'menu.setup', SETUP)}
        {menu('report', 'menu.report', REPORT)}
        {menu('system', 'menu.system', SYSTEM)}
        {single('menu.auto', 'auto', true)}
        {single('menu.okThanks', 'okThanks')}
        {single('menu.close', 'close')}
        {single('menu.template', 'template')}
        {single('menu.tEquals', 'tEquals')}
        <span className="ml-auto hidden items-center gap-2 text-sm text-slate-600 sm:flex">
          <span className="font-bold text-slate-800">{p.dateLabel}</span>
          {p.right}
        </span>
      </div>
    </div>
  );
}
