import { cn } from "@/lib/utils";

const SERVER_ICON_PATHS = {
  jp: "/res/server-icons/jp.svg",
  en: "/res/server-icons/en.svg",
  tw: "/res/server-icons/tw.svg",
  cn: "/res/server-icons/cn.svg",
  cn_intl: "/res/server-icons/cn.svg",
  kr: "/res/server-icons/kr.svg",
} as const;

export type ServerCode = keyof typeof SERVER_ICON_PATHS;
export type ServerIconProps = { code: ServerCode; size?: number; isDecorative?: boolean; className?: string };

export default function ServerIcon({ code, size = 20, isDecorative = false, className }: ServerIconProps) {
  const serverCode = code.toUpperCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={SERVER_ICON_PATHS[code]} alt={isDecorative ? "" : serverCode} aria-hidden={isDecorative ? true : undefined}
      width={size} height={size} className={cn("shrink-0 rounded-full object-contain", className)} />
  );
}
