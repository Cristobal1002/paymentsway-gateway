import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

export class PaymentsWayClient extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super('https://merchantpruebas.vepay.com.co', context, {
      ...options,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  public createTransaction(data: any) {
    return this.http.post('/link-de-pago/create', data)
  }
}