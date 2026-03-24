import { GET as getCalendarIcs } from "@/app/api/calendar/ics/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	return getCalendarIcs(request);
}