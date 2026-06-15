import BandoriPageShell from "@/app/[locale]/bandori/BandoriPageShell";
import NfoOfflinePrototype from "@/app/[locale]/bandori/nfo/NfoOfflinePrototype";

export default function BandoriNfoPage() {
  return (
    <BandoriPageShell contentClassName="max-w-6xl" spaced={false}>
      <div className="space-y-4">
        <div className="border-b border-gray-200 pb-3 dark:border-gray-800">
          <h1 className="text-2xl font-semibold tracking-normal text-gray-950 dark:text-gray-50">
            Neo Fantasy Online
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            CN local snapshot prototype
          </p>
        </div>
        <NfoOfflinePrototype />
      </div>
    </BandoriPageShell>
  );
}
