import { Injectable, Logger } from '@nestjs/common';
import { EXPO_PUSH_CONFIG, PUSH_NOTIFICATION_COPY } from './notification.constants';
import type { ExpoPushMessage, ExpoPushTicket } from './notification.types';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) return [];
    const response = await fetch(EXPO_PUSH_CONFIG.url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(EXPO_PUSH_CONFIG.timeoutMs),
    });
    if (!response.ok) throw new Error(`${PUSH_NOTIFICATION_COPY.httpErrorPrefix} ${response.status}`);

    const result = (await response.json()) as { data?: ExpoPushTicket[] | ExpoPushTicket };
    const tickets = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
    if (tickets.length !== messages.length) throw new Error(PUSH_NOTIFICATION_COPY.incompleteTickets);
    return tickets;
  }

  logPermanentFailure(jobId: string, error: unknown) {
    this.logger.error(
      `${PUSH_NOTIFICATION_COPY.permanentFailure} ${jobId}`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
