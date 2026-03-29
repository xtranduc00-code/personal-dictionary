/**
 * Drop stored subscription when the push endpoint rejects it permanently
 * or when VAPID keys no longer match how the subscription was created.
 */
export function shouldDropPushSubscription(
  statusCode: number | undefined,
  responseBody: string | undefined,
): boolean {
  if (statusCode === 404 || statusCode === 410) return true;
  if (
    statusCode === 403 &&
    responseBody &&
    /do not correspond to the credentials used to create the subscriptions/i.test(
      responseBody,
    )
  ) {
    return true;
  }
  return false;
}
