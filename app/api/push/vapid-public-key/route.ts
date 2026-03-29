import { NextResponse } from "next/server";
import { getVapidPublicKeyForClient, isWebPushConfigured } from "@/lib/push/web-push-config";

export async function GET() {
  const publicKey = getVapidPublicKeyForClient();
  return NextResponse.json({
    configured: isWebPushConfigured(),
    publicKey,
  });
}
