import {
  getNotificationActorName,
  getNotificationErrorMessage,
  getPushNotificationBody,
  getPushNotificationTitle,
} from '../notification.helpers';

describe('notification message helpers', () => {
  it('builds actor names from either or both profile names and falls back when absent', () => {
    expect(getNotificationActorName('Alice', 'Runner')).toBe('Alice Runner');
    expect(getNotificationActorName('Alice')).toBe('Alice');
    expect(getNotificationActorName(null, null)).toBe('Пользователь');
  });

  it.each([
    ['activity-like', 'Alice поставил(а) лайк'],
    ['comment', 'Alice прокомментировал(а) тренировку'],
    ['comment-like', 'Alice оценил(а) ваш комментарий'],
    ['unknown', 'Новое уведомление'],
  ])('formats title for %s', (type, title) => {
    expect(getPushNotificationTitle(type, 'Alice')).toBe(title);
  });

  it('uses event-specific fallback text or the supplied content clipped to push limits', () => {
    expect(getPushNotificationBody('activity-like', null)).toContain('понравилась');
    expect(getPushNotificationBody('comment-like', null)).toContain('обсуждение');
    expect(getPushNotificationBody('comment', null)).toContain('подробности');
    expect(getPushNotificationBody('comment', 'hello')).toBe('hello');
    expect(getPushNotificationBody('comment', 'x'.repeat(200))).toHaveLength(180);
  });

  it('normalizes Error and non-Error values for logging', () => {
    expect(getNotificationErrorMessage(new Error('offline'))).toBe('offline');
    expect(getNotificationErrorMessage({ code: 'EPIPE' })).toBe('[object Object]');
  });
});
