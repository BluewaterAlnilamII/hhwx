import { Suspense } from "react";
import AuthPageContent from "@/components/AuthPageContent";

function AuthPageFallback() {
  return (
    <main className="relative min-h-screen px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-[32px] border border-white/50 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-500">Account</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">正在准备账号入口</h1>
        </div>
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-sky-100 border-t-sky-500" />
          <p className="text-sm leading-6 text-slate-600">请稍候，页面马上就好。</p>
        </div>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <AuthPageContent />
    </Suspense>
  );
}