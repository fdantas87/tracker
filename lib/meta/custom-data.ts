import type { MetaCustomData } from "./capi"
import {
  LIMITS,
  cleanAmount,
  cleanString,
  cleanStringArray,
} from "@/lib/validation"

/**
 * Converte o `custom_data` solto que veio do navegador nos campos que a
 * Conversions API entende. Só passa o que reconhecemos e validamos — o resto
 * do objeto fica guardado no log, mas não é repassado ao Meta.
 *
 * Saiu de dentro de /api/event na fase 7.5: com a fila, o objeto bruto é
 * gravado na captura e só vira payload do Meta na hora do disparo, que pode
 * acontecer 15 minutos depois e num processo diferente.
 */
export function toMetaCustomData(
  customData: Record<string, unknown> | null
): MetaCustomData | null {
  if (!customData) return null

  const mapped: MetaCustomData = {
    value: cleanAmount(customData.value),
    currency: cleanString(customData.currency, 8),
    contentIds: cleanStringArray(customData.content_ids),
    contentName: cleanString(customData.content_name),
    contentType: cleanString(customData.content_type, 32),
    orderId: cleanString(customData.order_id, LIMITS.id),
  }

  const hasValue = Object.values(mapped).some(
    (value) => value !== null && value !== undefined
  )
  return hasValue ? mapped : null
}
