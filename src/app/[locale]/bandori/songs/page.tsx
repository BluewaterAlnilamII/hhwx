import { Suspense } from "react";
import BandoriPageShell from "../BandoriPageShell";
import SongsPageClient from "./SongsPageClient";

function SongsPageFallback() {
  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <section
        aria-busy="true"
        className="hhwx-panel min-h-80 animate-pulse border"
      />
    </BandoriPageShell>
  );
}

export default function BandoriSongsPage() {
  return (
    <Suspense fallback={<SongsPageFallback />}>
      <SongsPageClient />
    </Suspense>
  );
}
