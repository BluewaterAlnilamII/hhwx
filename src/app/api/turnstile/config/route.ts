import { isServerTurnstileEnabled } from "@/lib/turnstile-server";

export async function GET() {
  return Response.json(
    { enabled: isServerTurnstileEnabled() },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}