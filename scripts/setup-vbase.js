#!/usr/bin/env node
/**
 * Script para guardar los settings de PaymentsWay en VBase.
 * Úsalo para pruebas cuando VTEX no envía los settings al connector.
 *
 * Uso:
 *   1. Asegúrate de estar logueado: vtex whoami
 *   2. Desde la raíz del proyecto: node scripts/setup-vbase.js 698 593 622 TU_API_KEY
 *
 *   O con variables de entorno:
 *   MERCHANT_ID=698 TERMINAL_ID=593 FORM_ID=622 API_KEY=xxx node scripts/setup-vbase.js
 */

const { execSync } = require('child_process')

const merchantId = process.env.MERCHANT_ID || process.argv[2]
const terminalId = process.env.TERMINAL_ID || process.argv[3]
const formId = process.env.FORM_ID || process.argv[4]
const apiKey = process.env.API_KEY || process.argv[5]

if (!merchantId || !terminalId || !formId || !apiKey) {
  console.error(`
Uso: node scripts/setup-vbase.js <merchantId> <terminalId> <formId> <apiKey>

Ejemplo: node scripts/setup-vbase.js 698 593 622 "tu-api-key-secreta"

O con variables de entorno:
  MERCHANT_ID=698 TERMINAL_ID=593 FORM_ID=622 API_KEY=xxx node scripts/setup-vbase.js
`)
  process.exit(1)
}

const payload = JSON.stringify({
  merchantId: String(merchantId),
  terminalId: String(terminalId),
  formId: String(formId),
  apiKey: String(apiKey),
})

console.log('Guardando settings en VBase (bucket: paymentsway, path: provider-settings.json)...')
console.log('')

// Escapar el payload para la línea de comandos
const escapedPayload = payload.replace(/'/g, "'\"'\"'")

try {
  // vtex api: requiere estar logueado con vtex whoami
  const cmd = `vtex api post infra.vbase apis/appio/v1/accounts/{{accountName}}/buckets/paymentsway/files/provider-settings.json -d '${escapedPayload}'`
  execSync(cmd, { stdio: 'inherit' })
  console.log('')
  console.log('✓ Settings guardados correctamente en VBase.')
  console.log('  El connector los leerá como fallback cuando VTEX no envíe los settings.')
  console.log('  Haz una transacción de prueba para verificar.')
} catch (err) {
  console.error('')
  console.error('Error al guardar. Asegúrate de:')
  console.error('  1. Estar logueado: vtex whoami')
  console.error('  2. Estar en el workspace correcto: vtex use master')
  console.error('')
  console.error('Si el error persiste, intenta guardar manualmente con:')
  console.error('  vtex api post infra.vbase apis/appio/v1/accounts/{{accountName}}/buckets/paymentsway/files/provider-settings.json -d \'{"merchantId":"698","terminalId":"593","formId":"622","apiKey":"TU_API_KEY"}\'')
  process.exit(1)
}
