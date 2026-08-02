import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";
import { cn } from "@/lib/utils";

const BANDORI_SERVER_ICON_PATHS = [
  "/res/server-icons/jp.svg",
  "/res/server-icons/en.svg",
  "/res/server-icons/tw.svg",
  "/res/server-icons/cn.svg",
] as const;

export type BandoriServerIconProps = {
  server: BandoriServer;
  size?: number;
  isDecorative?: boolean;
  className?: string;
};

export default function BandoriServerIcon({
  server,
  size = 20,
  isDecorative = false,
  className,
}: BandoriServerIconProps) {
  const serverCode = getBandoriServerCode(server).toUpperCase();

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BANDORI_SERVER_ICON_PATHS[server]}
      alt={isDecorative ? "" : serverCode}
      aria-hidden={isDecorative ? true : undefined}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full object-contain", className)}
    />
  );
}
