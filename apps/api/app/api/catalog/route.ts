import { currentUser, isAdultUser, needsConsent } from '@/lib/auth';
import { effectivePlan } from '@/lib/billing';
import { listCatalog } from '@/lib/catalog';

/**
 * Published characters, for the lobby (signed in or not). A character above the account's plan comes back as a
 * teaser only: the personality and opening scene are what the plan pays for, and with them
 * anyone could rebuild the character as their own.
 */
export async function GET() {
  // Visitors may browse before signing in: they get the free plan's view and no 18+ characters.
  const user = await currentUser();
  const member = user && !needsConsent(user) ? user : null;
  const level = member ? (await effectivePlan(member.id)).level : 0;
  const adult = member ? isAdultUser(member) : false;
  return Response.json(
    (await listCatalog({ status: 'published' })).filter((e) => adult || !e.sheet.adult).map(({ reviewNote: _r, sourceId: _s, ...e }) =>
      e.tier > level ? { ...e, sheet: { ...e.sheet, personality: '', firstMessage: '', userRole: '' } } : e,
    ),
  );
}
