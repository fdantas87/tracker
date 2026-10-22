/**
 * Formato do `trck_user_id` que nasce no navegador: sempre UUID
 * (`crypto.randomUUID()` no track.js, ou o fallback no mesmo formato).
 *
 * Os endpoints públicos recusam qualquer outra coisa. Sem isso, o id virava
 * texto livre de até 128 caracteres escolhido por quem chama — inclusive os
 * prefixos que o servidor reserva para visitantes mínimos do webhook
 * (`bask_*`, `<plataforma>_tx_*`) e o `seed_*` do script de demonstração.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isTrckUserId(value: string | null): value is string {
  return value !== null && UUID_RE.test(value)
}
