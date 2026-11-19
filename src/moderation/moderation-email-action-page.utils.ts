import type { ModerationEmailAction } from './moderation-email-actions.types';
import { getModerationEmailActionLabel, getModerationEmailTargetLabel } from './moderation-email-actions.policy';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderModerationEmailActionPage({
  state,
  action,
  targetType,
  token,
}: {
  state: 'confirm' | 'success' | 'unavailable' | 'expired';
  action?: ModerationEmailAction;
  targetType?: string;
  token?: string;
}) {
  const actionLabel = action ? escapeHtml(getModerationEmailActionLabel(action)) : '';
  const targetLabel = escapeHtml(targetType ? getModerationEmailTargetLabel(targetType) : 'контент');
  const content =
    state === 'confirm'
      ? `<p>Будет выполнено действие: <strong>${actionLabel}</strong> для объекта «${targetLabel}».</p><p>Открытие этой страницы ничего не меняет. Решение попадёт в историю модерации.</p><form method="post" action="/moderation/email-actions/${escapeHtml(token ?? '')}"><button type="submit">Подтвердить действие</button></form><p class="hint">Ссылка действует 7 дней. После подтверждения жалоба будет закрыта.</p>`
      : state === 'success'
        ? `<p>Действие «<strong>${actionLabel}</strong>» выполнено. Жалоба закрыта.</p>`
        : state === 'unavailable'
          ? '<p>Это действие уже недоступно: жалоба обработана или состояние контента изменилось.</p>'
          : '<p>Ссылка недействительна или срок её действия истёк.</p>';
  const heading = state === 'confirm' ? 'Подтвердить действие модерации' : 'Модерация Runich';

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title><style>body{margin:0;background:#f5f5f3;color:#252525;font:16px/1.5 Arial,sans-serif}.card{max-width:560px;margin:10vh auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 4px 24px #00000012}h1{font-size:24px;line-height:1.25;margin:0 0 24px}p{margin:0 0 18px}button{border:0;border-radius:10px;background:#f2553d;color:#fff;font-size:16px;font-weight:700;padding:15px 22px;cursor:pointer}.hint{color:#666;font-size:13px;margin-top:18px}</style></head><body><main class="card"><h1>${heading}</h1>${content}</main></body></html>`;
}
