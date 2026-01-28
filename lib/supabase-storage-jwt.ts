import { SignJWT } from "jose";
/** Short-lived JWT so the browser Supabase client acts as `authenticated` (Storage RLS + RPC). Signed with Dashboard → Settings → API → JWT Secret (same as legacy `JWT_SECRET`). NOT the service_role key. */
const EXP_SEC = 900;
export async function mintSupabaseUserJwt(userId: string): Promise<{
  token: string;
  expiresIn: number;
}> {
  const secretStr = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!secretStr) {
    throw new Error("Missing SUPABASE_JWT_SECRET");
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  const secret = new TextEncoder().encode(secretStr);
  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuer(`${base}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime(`${EXP_SEC}s`)
    .sign(secret);
  return { token, expiresIn: EXP_SEC };
}
