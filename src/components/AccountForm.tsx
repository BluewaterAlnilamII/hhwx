"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EMAIL_OTP_LENGTH } from "@/lib/account-registration";

export const accountFormStyles = {
  input: "hhwx-control mt-2 min-h-12 w-full rounded-xl border px-4 py-3 text-base disabled:opacity-60",
  primary: "hhwx-accent-button min-h-12 w-full gap-2",
  secondary: "hhwx-text-link inline-flex min-h-11 items-center justify-center gap-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
  hint: "text-sm leading-6 text-[var(--theme-color-text-muted)]",
};

export function AccountFormPage({ backHref, backLabel, children }: {
  backHref: string; backLabel: string; children: ReactNode;
}) {
  return <main className="relative min-h-full px-2 py-4 sm:px-6 sm:py-10">
    <div className="mx-auto w-full max-w-lg">
      <Link href={backHref} className={`${accountFormStyles.secondary} mb-3 gap-2`}>
        <ArrowLeft aria-hidden="true" size={16} />{backLabel}
      </Link>
      <section className="hhwx-panel space-y-6 border p-4 sm:p-10">{children}</section>
    </div>
  </main>;
}

export function AccountFormHeading({ title, description }: {
  title: string; description?: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const previous = useRef(title);
  useEffect(() => {
    if (previous.current !== title) root.current?.querySelector("h1")?.focus();
    previous.current = title;
  }, [title]);
  return <header ref={root} className="space-y-2">
    <h1 tabIndex={-1} className="text-2xl font-semibold leading-snug text-[var(--theme-color-text-default)] outline-none">{title}</h1>
    {description && <div className={accountFormStyles.hint}>{description}</div>}
  </header>;
}

export function AccountFormResult({ title, detail, actionHref, actionLabel, success = true }: {
  title: string; detail?: string; actionHref: string; actionLabel: string; success?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.querySelector("h1")?.focus(); }, [title]);
  return <div ref={root} className="flex flex-col items-center py-6 text-center sm:py-8">
    {success
      ? <span aria-hidden="true" className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--theme-color-action-success-background)] text-[var(--theme-color-action-success-foreground)]"><Check size={32} strokeWidth={2.5} /></span>
      : <Info aria-hidden="true" size={48} className="mb-5 text-[var(--theme-color-semantic-info-foreground)]" />}
    <AccountFormHeading title={title} />
    {detail && <p className={`${accountFormStyles.hint} mt-3 w-full break-all`}>{detail}</p>}
    <Link href={actionHref} className={`${accountFormStyles.primary} mt-8 max-w-48`}>{actionLabel}</Link>
  </div>;
}

export function AccountFormError({ message }: { message: string }) {
  return message ? <p role="alert" className="text-sm leading-6 text-[var(--theme-color-semantic-danger-foreground)]">{message}</p> : null;
}

export function AccountField({ label, hint, error = "", validationMessage, validate, onChange, type = "text", className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & {
  id: string; label: string; hint?: string; error?: string; validationMessage?: string;
  validate?: (value: string) => string | null;
}) {
  const t = useTranslations("auth");
  const input = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [invalid, setInvalid] = useState("");
  const message = error || invalid;
  const description = [hint && `${props.id}-hint`, message && `${props.id}-error`].filter(Boolean).join(" ") || undefined;
  useEffect(() => {
    if (error && !props.disabled) input.current?.focus();
  }, [error, props.disabled]);

  function togglePassword() {
    const field = input.current;
    const restoreFocus = document.activeElement === field;
    const start = field?.selectionStart ?? null;
    const end = field?.selectionEnd ?? null;
    setVisible((value) => !value);
    requestAnimationFrame(() => {
      if (restoreFocus) field?.focus({ preventScroll: true });
      if (start !== null && end !== null) field?.setSelectionRange(start, end);
    });
  }

  return <div>
    <label htmlFor={props.id} className="inline-block text-sm font-medium">{label}</label>
    <div className="relative mt-2">
      <input {...props} ref={input} type={type === "password" && visible ? "text" : type}
        className={`${accountFormStyles.input} !mt-0 ${type === "password" ? "pr-14" : ""} ${className}`}
        aria-invalid={Boolean(message)} aria-describedby={description}
        onInvalid={(event) => {
          event.preventDefault();
          const field = event.currentTarget;
          setInvalid(validationMessage || (field.validity.valueMissing ? t("validation.required", { label })
            : field.validity.typeMismatch && type === "email" ? t("validation.invalidEmail")
            : validate?.(field.value) || t("validation.generic", { label })));
          field.form?.querySelector<HTMLInputElement>("input:invalid")?.focus();
        }}
        onChange={(event) => { setInvalid(""); onChange?.(event); }} />
      {type === "password" && <button type="button" disabled={props.disabled}
        className="hhwx-text-link absolute inset-y-0 right-1 inline-flex w-11 items-center justify-center rounded-lg disabled:opacity-50"
        aria-label={t(visible ? "actions.hidePassword" : "actions.showPassword")} aria-controls={props.id}
        onMouseDown={(event) => event.preventDefault()} onClick={togglePassword}>
        {visible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
      </button>}
    </div>
    {hint && <p id={`${props.id}-hint`} className="mt-2 text-xs leading-5 text-[var(--theme-color-text-muted)]">{hint}</p>}
    {message && <p id={`${props.id}-error`} role="alert" className="mt-2 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{message}</p>}
  </div>;
}

export function EmailCodeField({ label, value, onChange, disabled, error }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean; error: string;
}) {
  const id = useId();
  const t = useTranslations("auth.otp");
  return <AccountField id={id} name="code" label={label} error={error} validationMessage={t("invalidCode")}
      className="tracking-[0.2em]" value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/gu, "").slice(0, EMAIL_OTP_LENGTH))}
      inputMode="numeric" autoComplete="one-time-code" autoFocus pattern={`[0-9]{${EMAIL_OTP_LENGTH}}`}
      minLength={EMAIL_OTP_LENGTH} maxLength={EMAIL_OTP_LENGTH} required disabled={disabled} />;
}
