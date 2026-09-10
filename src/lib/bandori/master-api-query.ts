import { normalizeBandoriServer, type BandoriServer } from "@/lib/bandori-server";

export type BandoriMasterServerQuery =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "unsupported" }
  | { status: "valid"; server: BandoriServer };

export function parseBandoriMasterServerQuery(request: Request): BandoriMasterServerQuery {
  const searchParams = new URL(request.url).searchParams;
  const keys = [...searchParams.keys()];
  if (keys.length === 0) return { status: "absent" };
  if (!keys.every((key) => key === "server")) return { status: "unsupported" };
  const values = searchParams.getAll("server");
  const server = values.length === 1 ? normalizeBandoriServer(values[0]) : null;
  return server === null ? { status: "invalid" } : { status: "valid", server };
}
