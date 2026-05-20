import AccountShell, { type AccountShellProps } from "@/app/account/AccountShell";
import { cn } from "@/lib/utils";
import { BANDORI_ACCOUNT_PAGE_MAX_WIDTH_CLASS } from "./BandoriPageShell";

type BandoriAccountShellProps = Omit<AccountShellProps, "containerClassName"> & {
  containerClassName?: string;
};

export default function BandoriAccountShell({
  containerClassName,
  ...props
}: BandoriAccountShellProps) {
  return (
    <AccountShell
      {...props}
      containerClassName={cn(BANDORI_ACCOUNT_PAGE_MAX_WIDTH_CLASS, containerClassName)}
    />
  );
}
