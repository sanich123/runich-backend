import { ApiProperty } from '@nestjs/swagger';

export const SUBSCRIPTION_STATUSES = ['none', 'pending', 'active', 'cancelled', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export class CurrentSubscriptionResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  userId: string;

  @ApiProperty({ type: Boolean })
  isPremium: boolean;

  @ApiProperty({ enum: SUBSCRIPTION_STATUSES })
  status: SubscriptionStatus;

  @ApiProperty({ type: String, nullable: true })
  provider: string | null;

  @ApiProperty({ type: String, nullable: true })
  productId: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startsAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt: string | null;

  @ApiProperty({ type: Boolean })
  cancelAtPeriodEnd: boolean;
}
