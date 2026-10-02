"use client";

import ServerSwitcher, { type ServerSwitcherProps } from "@/components/ServerSwitcher";
import { BANDORI_SERVERS, getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";

export type BandoriCardServerSwitcherProps = Omit<ServerSwitcherProps<BandoriServer>, "servers" | "getCode">;

export default function BandoriCardServerSwitcher(props: BandoriCardServerSwitcherProps) {
  return <ServerSwitcher {...props} servers={BANDORI_SERVERS} getCode={getBandoriServerCode} />;
}
