"use client";
import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import SortList from "./ProfileSortList";
import { CSS } from "@dnd-kit/utilities";
import { EyeOff, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import Switch from "@/components/Switch";
import ActionFeedback from "@/components/ActionFeedback";
import type { ActionFeedbackState } from "@/hooks/useActionFeedback";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import { profileAccountKey, bindingVisibility, type ProfileHomepagePreferences } from "@/lib/profile-homepage";
import styles from "./PublicProfile.module.css";

function Row({ id, label, readOnly, saving, children, feedback }: { id: string; label: string; readOnly: boolean; saving: boolean; children: ReactNode; feedback: ActionFeedbackState | null }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: readOnly || saving });
  return <div ref={setNodeRef} className={styles.sortable} data-dragging={isDragging} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <div className="relative mt-1.5 shrink-0">
      <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} disabled={readOnly} className={styles.drag} aria-label={label}><GripVertical size={16} /></button>
      <ActionFeedback feedback={feedback} className="left-full top-1/2 ml-2 -translate-y-1/2" />
    </div>
    <div className={styles.sortContent}>{children}</div>
  </div>;
}

export type ModuleSettings = Pick<ProfileHomepagePreferences, "modules">;
export type BindingSettings = Partial<Pick<ProfileHomepagePreferences, "accounts" | "publicAccounts" | "allowGameIdSearch">>;
type Column<T> = {
  pending: T | null;
  save: (values: T, target: string) => Promise<boolean>;
  feedbackFor: (target: string) => ActionFeedbackState | null;
};

export default function ProfileSettings({ preferences, readOnly, modules, accounts }: {
  preferences: ProfileHomepagePreferences; readOnly: boolean;
  modules: Column<ModuleSettings>; accounts: Column<BindingSettings>;
}) {
  const t = useTranslations("account.homepage");
  const saveBindings = accounts.save;
  const toggle = (column: Column<ModuleSettings> | Column<BindingSettings>, target: string, label: string, checked: boolean, change: (value: boolean) => void, locked = false) =>
    <span className="relative inline-flex shrink-0 items-center gap-2">
      {target !== "allowGameIdSearch" && <span className={styles.visibilityState} aria-hidden="true" title={checked ? undefined : t("private")}>
        {checked ? t("public") : <EyeOff size={14} />}
      </span>}
      <Switch className={styles.switch} label={label} checked={checked} disabled={readOnly || locked} aria-disabled={column.pending ? true : undefined}
        checkedLabel={t("public")} uncheckedLabel={t("private")} showStateLabel={false} onCheckedChange={change} />
      <ActionFeedback feedback={column.feedbackFor(target)} className={target === "allowGameIdSearch" ? "static order-first" : "right-full top-1/2 mr-2 -translate-y-1/2"} />
    </span>;
  return <div className={styles.settings}>
    <section><div className={styles.settingRow}><h2>{t("homeDisplay")}</h2></div>
      <SortList ids={preferences.modules.map(m => m.id)} onOrder={(ids, movedId) => modules.save({ modules: ids.map(id => preferences.modules.find(m => m.id === id)!) }, `module-order:${movedId}`)}>
        {preferences.modules.map(module => <Row key={module.id} id={module.id} label={t("reorder", { name: t(module.id) })} readOnly={readOnly} saving={Boolean(modules.pending)} feedback={modules.feedbackFor(`module-order:${module.id}`)}>
          <div className={styles.settingRow}><span>{t(module.id)}</span>{toggle(modules, `module:${module.id}`, t("publish", { name: t(module.id) }), module.public, value => modules.save({ modules: preferences.modules.map(m => m.id === module.id ? { ...m, public: value } : m) }, `module:${module.id}`))}</div>
        </Row>)}
      </SortList>
    </section>
    <section><div className={styles.settingRow}><h2>{t("accounts")}</h2>{toggle(accounts, "accounts", t("publish", { name: t("accounts") }), preferences.publicAccounts, value => saveBindings({ publicAccounts: value }, "accounts"))}</div>
      <div className={`${styles.settingRow} ${styles.lookupRow}`}><span>{t("allowGameIdSearch")}</span>
        {toggle(accounts, "allowGameIdSearch", t("allowGameIdSearch"), preferences.publicAccounts && preferences.allowGameIdSearch, value => saveBindings({ allowGameIdSearch: value }, "allowGameIdSearch"), !preferences.publicAccounts)}</div>
      <SortList ids={preferences.accounts.map(profileAccountKey)} onOrder={(ids, movedId) => saveBindings({ accounts: ids.map(id => preferences.accounts.find(a => profileAccountKey(a) === id)!) }, `account-order:${movedId}`)}>
        {preferences.accounts.map(account => {
          const effective = bindingVisibility(preferences.publicAccounts, account);
          const key = profileAccountKey(account);
          const update = (patch: Partial<typeof account>, target: string) => saveBindings({ accounts: preferences.accounts.map(a => profileAccountKey(a) === key ? { ...a, ...patch } : a) }, target);
          return <Row key={key} id={key} label={t("reorder", { name: account.gameUid })} readOnly={readOnly} saving={Boolean(accounts.pending)} feedback={accounts.feedbackFor(`account-order:${key}`)}>
            <div className={styles.settingRow}><span className={styles.accountId}><BandoriServerIcon server={account.server} size={20} />{account.gameUid}</span>
              {toggle(accounts, `account:${key}`, t("publish", { name: account.gameUid }), effective.public, value => update({ public: value }, `account:${key}`), !preferences.publicAccounts)}</div>
            <div className={`${styles.settingRow} ${styles.settingChild}`}><span>{t("titles")}</span>{toggle(accounts, `titles:${key}`, t("publishTitles", { id: account.gameUid }), effective.titlesPublic, value => update({ titlesPublic: value }, `titles:${key}`), !effective.public)}</div>
          </Row>;
        })}
      </SortList>
    </section>
  </div>;
}
