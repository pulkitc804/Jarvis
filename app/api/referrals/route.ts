import { addReferral, deleteReferral, readReferrals, updateReferral } from "@/lib/referrals";
import { listInternships } from "@/lib/internships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const referrals = readReferrals();
  const { internships } = listInternships();
  // Companies you're tracking roles at but have no contact for yet — the gap
  // worth closing, since warm intros beat cold applications.
  const withContact = new Set(referrals.map((r) => r.company.toLowerCase().trim()));
  const gaps = [...new Set(internships.filter((j) => j.bigTech).map((j) => j.company))]
    .filter((c) => !withContact.has(c.toLowerCase().trim()))
    .slice(0, 12);
  return Response.json({ referrals, gaps, contactedCount: referrals.filter((r) => r.contacted).length });
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as {
    company?: string;
    contactName?: string;
    relation?: string;
    notes?: string;
  };
  if (!b.company?.trim() || !b.contactName?.trim()) {
    return Response.json({ error: "company and contactName required" }, { status: 400 });
  }
  return Response.json({ ok: true, referral: addReferral(b as { company: string; contactName: string }) });
}

export async function PATCH(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { id?: string; contacted?: boolean; notes?: string };
  if (!b.id) return Response.json({ error: "id required" }, { status: 400 });
  const r = updateReferral(b.id, { contacted: b.contacted, notes: b.notes });
  return r ? Response.json({ ok: true, referral: r }) : Response.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  return deleteReferral(id) ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
