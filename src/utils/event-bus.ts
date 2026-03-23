import { EventEmitter } from 'events'

export type BotEvent =
  | { type: 'message:incoming'; phone: string; body: string; timestamp: number }
  | { type: 'message:outgoing'; phone: string; text: string; flow: string; timestamp: number }
  | { type: 'escalation'; phone: string; reason: string; message: string; timestamp: number }
  | { type: 'error'; context: string; error: string; timestamp: number }
  | { type: 'connection'; status: string; timestamp: number }
  | { type: 'log'; level: string; message: string; timestamp: number }
  | { type: 'closure'; phone: string; emoji: string; timestamp: number }
  | { type: 'metrics'; [key: string]: unknown; timestamp: number }

class BotEventBus extends EventEmitter {
  publish(event: BotEvent): void {
    this.emit('bot-event', event)
  }

  subscribe(listener: (event: BotEvent) => void): () => void {
    this.on('bot-event', listener)
    return () => this.off('bot-event', listener)
  }
}

export const botEvents = new BotEventBus()
botEvents.setMaxListeners(100)
