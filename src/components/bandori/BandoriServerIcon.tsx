import ServerIcon, { type ServerIconProps } from "@/components/ServerIcon";
import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";

export type BandoriServerIconProps = Omit<ServerIconProps, "code"> & { server: BandoriServer };

export default function BandoriServerIcon({ server, ...props }: BandoriServerIconProps) {
  return <ServerIcon {...props} code={getBandoriServerCode(server)} />;
}
