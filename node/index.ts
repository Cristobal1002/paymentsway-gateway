import { PaymentProviderService, PaymentProviderState, PaymentRequest } from '@vtex/payment-provider'
import { ParamsContext } from '@vtex/api'
import PaymentsWayProvider from './connector'
import { Clients } from './clients'

export default new PaymentProviderService<Clients, PaymentProviderState<PaymentRequest>, ParamsContext>({
  connector: PaymentsWayProvider,
  clients: {
    implementation: Clients,
    options: {}
  }
})