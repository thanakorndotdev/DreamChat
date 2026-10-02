import { currentUser, needsConsent } from '@/lib/server/auth';

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ username: null, isAdmin: false, needsConsent: false });
  return Response.json({
    username: user.username,
    isAdmin: user.isAdmin,
    needsConsent: needsConsent(user),
    email: user.email,
    phone: user.phone,
  });
}
