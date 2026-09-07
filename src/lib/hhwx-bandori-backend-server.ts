import "server-only";

export function getBandoriBackendToken(): string | undefined {
  return process.env.HHWX_BANDORI_BACKEND_TOKEN?.trim()
    || process.env.HHWX_USER_FETCHER_TOKEN?.trim();
}
