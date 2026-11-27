/**
 * Mensagem propria para a recusa da reabertura que a mensagem generica de 409
 * ("Os dados mudaram...") descreveria errado. Os demais codigos seguem em
 * `reportErrorMessage`.
 */
export function reopenRefusalMessage(code:string|undefined):string|null {
  return code==='staff_route_payment_closed' ?
    'Esta rota já tem pagamento aprovado ou pago e não pode ser reaberta por aqui.':null;
}
