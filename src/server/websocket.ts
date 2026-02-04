import type { WebSocket } from 'ws'

// Almacen de conexiones WebSocket activas
const clients = new Set<WebSocket>()

export function addClient(ws: WebSocket): void {
  clients.add(ws)
}

export function removeClient(ws: WebSocket): void {
  clients.delete(ws)
}

export function broadcast(data: unknown): void {
  const message = JSON.stringify(data)
  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message)
    }
  })
}

export function getClientCount(): number {
  return clients.size
}
