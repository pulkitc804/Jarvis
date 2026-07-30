import { getGithubActivity } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getGithubActivity());
}
