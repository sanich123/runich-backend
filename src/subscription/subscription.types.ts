export interface SubscriptionRecord {
  provider: string;
  productId: string | null;
  status: string;
  startsAt: Date | string;
  expiresAt: Date | string | null;
  cancelAtPeriodEnd: boolean;
}
