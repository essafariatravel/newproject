/** Provider statuses safe to retry once; never retry malformed or invalid-key requests. */
export function isTransientPushFailure(status: number | null): boolean {
  return status === null || status === 429 || (status >= 500 && status <= 599);
}
