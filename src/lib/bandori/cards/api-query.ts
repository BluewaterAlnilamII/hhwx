import {
  normalizeBandoriCardServer,
  type BandoriCardServer,
} from "@/lib/bandori/cards/regional-extensions";

export type BandoriCardServerQuery =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "unsupported" }
  | { status: "valid"; server: BandoriCardServer };

export function parseBandoriCardServerQuery(request: Request): BandoriCardServerQuery {
  const searchParams = new URL(request.url).searchParams;
  const queryKeys = [...searchParams.keys()];
  if (queryKeys.length === 0) {
    return { status: "absent" };
  }
  if (!queryKeys.every((key) => key === "server")) {
    return { status: "unsupported" };
  }

  const rawServers = searchParams.getAll("server");
  const server = rawServers.length === 1
    ? normalizeBandoriCardServer(rawServers[0])
    : null;
  return server !== null
    ? { status: "valid", server }
    : { status: "invalid" };
}
