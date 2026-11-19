import {EarningsRequestError} from '@/lib/earnings/session-request';

export function staffNotificationError(error:unknown,fallback:string) {
  if (!(error instanceof EarningsRequestError)) return fallback;
  if (error.status===401 || error.status===403) return 'Sua sessão precisa de acesso às notificações.';
  switch (error.code) {
    case 'staff_notification_recipient_unavailable':return 'Um dos motoristas selecionados está indisponível. Revise a seleção.';
    case 'staff_notification_revision_conflict':return 'A notificação foi atualizada. A lista será recarregada.';
    case 'staff_notification_push_unavailable':return 'O envio de push está indisponível neste ambiente.';
    case 'earnings_session_revalidating':return 'Aguarde a confirmação da sessão e tente novamente.';
    default:return fallback;
  }
}
