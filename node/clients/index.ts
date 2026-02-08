import { IOClients } from '@vtex/api'
import { PaymentsWayClient } from './paymentsWay'

export class Clients extends IOClients {
  public get paymentsWay() {
    return this.getOrSet('paymentsWay', PaymentsWayClient)
  }
}