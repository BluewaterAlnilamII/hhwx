import Link from "next/link";
import { buildAuthPath } from "@/lib/supabase";

interface AccountShellProps {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}

interface AccountStateProps {
  message: string;
}

export default function AccountShell({
  title,
  description,
  backHref = "/account",
  backLabel = "返回账号中心",
  children,
}: AccountShellProps) {
  return (
    <main className="relative min-h-full px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[32px] border border-white/50 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-500">Account</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
            </div>
            <Link
              href={backHref}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600"
            >
              {backLabel}
            </Link>
          </div>

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function AccountLoadingState({ message }: AccountStateProps) {
  return <div className="py-16 text-center text-slate-500">{message}</div>;
}

export function AccountErrorState({ message }: AccountStateProps) {
  return <div className="rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-600">{message}</div>;
}

export function AccountSignInState({ nextPath }: { nextPath: string }) {
  return (
    <div className="py-16 text-center">
      <h2 className="text-xl font-semibold text-slate-900">请先登录</h2>
      <p className="mt-2 text-sm text-slate-600">登录后即可查看和管理个人账号设置。</p>
      <div className="mt-5">
        <Link
          href={buildAuthPath("login", nextPath)}
          className="hhwx-accent-button"
        >
          前往登录页
        </Link>
      </div>
    </div>
  );
}