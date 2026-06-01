/**
 * CRMClient — contract (master prompt §4.3).
 *
 * Determines whether an incoming phone belongs to an existing client.
 * The current default implementation reads from a hardcoded list
 * (placeholder until Phase 12 wires a real HTTP/CSV-backed client).
 *
 * Async by design — real implementations will hit a network or a file.
 */

import { isExistingClient as staticIsExistingClient } from './static-list.js'

export interface CRMClient {
  isExistingClient(phone: string): Promise<boolean>
}

/**
 * Default static-list implementation. Synchronous under the hood, async
 * at the boundary to keep the contract honest for future remote clients.
 */
export const defaultCRMClient: CRMClient = {
  isExistingClient: async (phone) => staticIsExistingClient(phone),
}
