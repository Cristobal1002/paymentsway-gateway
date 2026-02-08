import {
  AuthorizationRequest,
  AuthorizationResponse,
  CancellationRequest,
  CancellationResponse,
  RefundRequest,
  RefundResponse,
  PaymentProvider,
  Authorizations,
  InboundRequest,
  InboundResponse,
  SettlementRequest,
  SettlementResponse,
} from '@vtex/payment-provider'

import * as crypto from 'crypto'
import { Clients } from './clients'

type ProviderSettings = {
  merchantId?: string | number
  terminalId?: string | number
  formId?: string | number
  apiKey?: string
}

function normalizeSettings(raw: any): ProviderSettings {
  if (!raw || typeof raw !== 'object') return {}

  // soporta variantes de keys
  const merchantId = raw.merchantId ?? raw.merchant_id ?? raw.MerchantId ?? raw.MERCHANT_ID
  const terminalId = raw.terminalId ?? raw.terminal_id ?? raw.TerminalId ?? raw.TERMINAL_ID
  const formId = raw.formId ?? raw.form_id ?? raw.FormId ?? raw.FORM_ID
  const apiKey = raw.apiKey ?? raw.api_key ?? raw.apikey ?? raw.ApiKey ?? raw.API_KEY

  return { merchantId, terminalId, formId, apiKey }
}

function hasAllSettings(s: ProviderSettings) {
  return Boolean(s.merchantId && s.terminalId && s.formId && s.apiKey)
}

function safeStringify(obj: any, maxLen = 4000) {
  try {
    const str = JSON.stringify(obj)
    return str.length > maxLen ? str.slice(0, maxLen) + '...<truncated>' : str
  } catch {
    return '[unstringifiable]'
  }
}

/**
 * Convierte merchantSettings (CustomField[]) a objeto { name: value }
 * VTEX envía la config del provider en merchantSettings para flujos redirect/callback
 */
function merchantSettingsToObject(merchantSettings: Array<{ name: string; value: string }> | null | undefined): Record<string, string> {
  if (!Array.isArray(merchantSettings)) return {}
  return merchantSettings.reduce((acc, f) => {
    if (f?.name != null) acc[f.name] = String(f?.value ?? '')
    return acc
  }, {} as Record<string, string>)
}

/**
 * Intenta sacar settings desde el AuthorizationRequest
 * (VTEX puede mandarlo en diferentes ramas según el flow / versión)
 * - merchantSettings: usado por VTEX en Payment Provider Protocol (Colombia, redirect flows)
 * - paymentProvider.settings: Admin > Payments
 */
function readProviderSettingsFromAuthorization(authorization: AuthorizationRequest): any {
  const a: any = authorization as any

  // merchantSettings es donde VTEX suele enviar la config en el protocolo estándar
  const fromMerchantSettings = merchantSettingsToObject(a?.merchantSettings)
  if (Object.keys(fromMerchantSettings).length > 0) {
    return fromMerchantSettings
  }

  return (
    a?.paymentProvider?.settings ||
    a?.paymentProvider?.configuration ||
    a?.paymentProvider?.providerSettings ||
    a?.connector?.settings ||
    a?.connector?.configuration ||
    a?.settings ||
    a?.payment?.settings ||
    a?.payment?.paymentProvider?.settings ||
    {}
  )
}

export default class PaymentsWayProvider extends PaymentProvider<Clients> {
  public async authorize(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    // ====== Version / runtime info (para que sepas qué está corriendo) ======
    const runtimeInfo = {
      appVendor: process.env.VTEX_APP_VENDOR,
      appName: process.env.VTEX_APP_NAME,
      appVersion: process.env.VTEX_APP_VERSION,
      appIdEnv: process.env.VTEX_APP_ID,
      workspace: process.env.VTEX_WORKSPACE,
      region: process.env.VTEX_REGION,
      accountFromQuery: (this.context as any)?.vtex?.account,
    }

    console.log('[PaymentsWay][authorize] runtime', runtimeInfo)

    console.log('[PaymentsWay][authorize] init', {
      paymentId: authorization.paymentId,
      value: authorization.value,
      currency: authorization.currency,
      paymentMethod: authorization.paymentMethod,
      callbackUrl: (authorization as any)?.callbackUrl ? '[present]' : '[missing]',
      merchantSettingsCount: Array.isArray((authorization as any)?.merchantSettings)
        ? (authorization as any).merchantSettings.length
        : 0,
      topLevelKeys: Object.keys(authorization as any),
      paymentProviderKeys: Object.keys(((authorization as any)?.paymentProvider ?? {}) as any),
      connectorKeys: Object.keys(((authorization as any)?.connector ?? {}) as any),
    })

    // ====== 1) Provider settings (Admin > Payments) ======
    const providerSettingsRaw = readProviderSettingsFromAuthorization(authorization)

    console.log(
      '[PaymentsWay][authorize] providerSettingsRaw',
      safeStringify(providerSettingsRaw)
    )

    let settings = normalizeSettings(providerSettingsRaw)

    console.log('[PaymentsWay][authorize] providerSettings normalized', {
      merchantId: settings.merchantId,
      terminalId: settings.terminalId,
      formId: settings.formId,
      apiKeyPresent: Boolean(settings.apiKey),
    })

    // ====== 2) Fallback: App Settings ======
    if (!hasAllSettings(settings)) {
      const appId =
        (process.env.VTEX_APP_ID as string) ||
        (this.context as any)?.vtex?.appId ||
        // último fallback: tu appId fijo
        'paymentswaypartnerco.paymentsway-gateway'

      console.warn('[PaymentsWay][authorize] missing provider settings, trying app settings', {
        appId,
      })

      try {
        const appSettingsRaw = await this.context.clients.apps.getAppSettings(appId)
        console.log('[PaymentsWay][authorize] appSettingsRaw', safeStringify(appSettingsRaw))

        const appSettings = normalizeSettings(appSettingsRaw)

        settings = {
          merchantId: settings.merchantId ?? appSettings.merchantId,
          terminalId: settings.terminalId ?? appSettings.terminalId,
          formId: settings.formId ?? appSettings.formId,
          apiKey: settings.apiKey ?? appSettings.apiKey,
        }

        console.log('[PaymentsWay][authorize] merged settings after app settings', {
          merchantId: settings.merchantId,
          terminalId: settings.terminalId,
          formId: settings.formId,
          apiKeyPresent: Boolean(settings.apiKey),
        })
      } catch (err) {
        const e = err as any
        console.error('[PaymentsWay][authorize] ERROR reading app settings', {
          message: e?.message,
          status: e?.response?.status,
          data: e?.response?.data,
        })
      }
    }

    const { merchantId, terminalId, formId, apiKey } = settings

    // ====== 3) Validación final ======
    if (!merchantId || !terminalId || !formId || !apiKey) {
      console.error('[PaymentsWay][authorize] Missing settings fields FINAL', {
        merchantId,
        terminalId,
        formId,
        apiKeyPresent: Boolean(apiKey),
        hint:
          'Esto significa que VTEX NO está enviando la config del Provider (Admin > Payments) ' +
          'o está vacía, y/o el App Settings está vacío/no accesible.',
      })

      throw new Error(
        'Missing required provider settings (merchantId/terminalId/formId/apiKey). ' +
          'Revisa el Provider (PaymentsWay v1.1) en Admin > Payments.'
      )
    }

    // ====== 4) Construcción payload hacia PaymentsWay ======
    const amount = authorization.value
    const currency = authorization.currency
    const orderNumber = authorization.paymentId

    const toSign = `${formId};${apiKey};${merchantId};${amount};${orderNumber}`
    const checksum = crypto.createHash('sha256').update(toSign).digest('hex')

    // IMPORTANTE para Colombia/LATAM:
    // Usar callbackUrl que VTEX envía en el request (regional: gateway, gatewayqa, heimdall, etc.)
    // No hardcodear heimdall.vtexpayments.com.br (solo Brasil)
    const responseUrl = authorization.callbackUrl || 'https://gateway.vtexpayments.com.br/api/payment-provider/callback'

    const payload = {
      form_id: Number(formId),
      terminal_id: Number(terminalId),
      merchant_id: Number(merchantId),
      order_number: orderNumber,
      amount,
      currency,
      checksum,
      response_url: responseUrl,
    }

    console.log('[PaymentsWay][authorize] payload (response_url truncated)', {
      ...payload,
      response_url: responseUrl?.slice(0, 80) + (responseUrl?.length > 80 ? '...' : ''),
    })

    try {
      const response: any = await this.context.clients.paymentsWay.createTransaction(payload)

      console.log('[PaymentsWay][authorize] paymentsWay response', safeStringify(response))

      const redirectUrl =
        response?.url || response?.redirect_url || response?.payment_url || response?.data?.url

      if (!redirectUrl) {
        throw new Error('PaymentsWay did not return a redirect URL')
      }

      return Authorizations.redirect(authorization, {
        redirectUrl,
        delayToCancel: 0,
        tid: authorization.paymentId,
      })
    } catch (err) {
      const e = err as any
      console.error('[PaymentsWay][authorize] ERROR createTransaction', {
        message: e?.message,
        status: e?.response?.status,
        data: e?.response?.data,
      })
      throw err
    }
  }

  public async refund(refundReq: RefundRequest): Promise<RefundResponse> {
    console.log('[PaymentsWay][refund]', refundReq)
    return {
      requestId: refundReq.requestId,
      paymentId: refundReq.paymentId,
      refundId: refundReq.requestId,
      value: refundReq.value,
      code: 'refund-success',
      message: 'Refund processed successfully',
    }
  }

  public async cancel(
    cancellation: CancellationRequest
  ): Promise<CancellationResponse> {
    console.log('[PaymentsWay][cancel]', cancellation)
    return {
      paymentId: cancellation.paymentId,
      cancellationId: cancellation.paymentId,
      code: 'cancellation-success',
      message: 'Cancellation processed successfully',
    }
  }

  public async inbound(inbound: InboundRequest): Promise<InboundResponse> {
    console.log('[PaymentsWay][inbound]', inbound)
    return {
      requestId: inbound.requestId,
      paymentId: inbound.paymentId,
      responseData: {
        statusCode: 200,
        contentType: 'application/json',
        content: JSON.stringify({ success: true }),
      },
      code: 'inbound-success',
      message: 'Inbound processed',
    }
  }

  public async settle(settle: SettlementRequest): Promise<SettlementResponse> {
    console.log('[PaymentsWay][settle]', settle)
    return {
      requestId: settle.requestId,
      paymentId: settle.paymentId,
      value: settle.value,
      settleId: settle.paymentId,
      code: 'settlement-success',
      message: 'Settlement processed successfully',
    }
  }
}