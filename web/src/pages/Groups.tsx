import { useState } from 'react';
import type { GroupPack, TemplateItem } from '../lib/db';
import { useLang } from '../i18n';

interface Props {
  templates: TemplateItem[];
  groups: GroupPack[];
  onCopyTemplate: (text: string) => void;
  /** Replay uses each row's stored amount and clears the entry grid first (D9). */
  onReplayGroup: (g: GroupPack) => void;
}

export default function GroupsPage(p: Props) {
  const { t } = useLang();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">{t('groups.templates')}</h2>
        <p className="text-sm text-slate-500">{t('groups.templatesNote')}</p>
        <div className="mt-2 flex flex-col gap-1">
          {p.templates.map((tmpl) => (
            <button
              key={tmpl.no}
              type="button"
              onClick={() => p.onCopyTemplate(tmpl.text)}
              className="btn btn-outline w-full justify-start text-sm font-normal"
            >
              <span className="mr-2 text-xs text-slate-400">{tmpl.no}</span>
              {tmpl.text}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">{t('groups.groups')}</h2>
        <p className="text-sm text-slate-500">{t('groups.groupsNote')}</p>
        <div className="mt-2 flex flex-col gap-1">
          {p.groups.map((g) => (
            <div key={g.name} className="rounded-lg border">
              <button
                type="button"
                onClick={() => setOpen(open === g.name ? null : g.name)}
                className="btn btn-outline w-full justify-between border-0 text-sm"
              >
                <span>{g.name}</span>
                <span className="text-xs font-normal text-slate-500">{t('groups.codesCount', { n: g.rows.length })}</span>
              </button>
              {open === g.name && (
                <div className="border-t px-3 py-2">
                  <p className="break-words text-xs text-slate-500">
                    {g.rows.map((r) => `${r.code} (${r.amount})`).join(' · ')}
                  </p>
                  <button type="button" onClick={() => p.onReplayGroup(g)} className="btn btn-primary btn-sm mt-2">
                    {t('groups.sendToFighter')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
