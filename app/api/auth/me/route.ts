import { currentUser, isAdultUser, needsConsent } from '@/lib/server/auth';

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ username: null, isAdmin: false, needsConsent: false, email: null, phone: null, birthdate: null, age: null, adult: false, guardianConsent: false });
  return Response.json({
    username: user.username,
    isAdmin: user.isAdmin,
    needsConsent: needsConsent(user),
    email: user.email,
    phone: user.phone,
    birthdate: user.birthdate,
    age: user.age,
    adult: isAdultUser(user),
    guardianConsent: user.guardianConsent,
  });
}
