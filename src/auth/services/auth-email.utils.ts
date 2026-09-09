export function getEmailDeliveryReason(error: unknown) {
  const providerError = error as { code?: unknown; message?: unknown };
  const code = typeof providerError?.code === 'string' ? providerError.code : '';
  const message = typeof providerError?.message === 'string' ? providerError.message : '';

  if (message.startsWith('Не настроена обязательная переменная окружения:')) {
    return 'не настроена почтовая конфигурация сервера';
  }
  if (code === 'EAUTH') return 'почтовый сервер отклонил авторизацию';
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED', 'ENOTFOUND'].includes(code)) {
    return 'не удалось подключиться к почтовому серверу';
  }
  if (code === 'EMESSAGE' || code === 'EENVELOPE') return 'почтовый сервер отклонил сообщение';
  return 'почтовый провайдер не подтвердил отправку';
}
