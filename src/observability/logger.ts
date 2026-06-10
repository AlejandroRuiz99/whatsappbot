/**
 * API compatible con el logger anterior. Delega en logService para mantener
 * ring buffer, archivo rotativo y emisión de eventos al admin panel.
 */
import { logService, isDebugEnabled } from './log-service.js'

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19)
}

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`${colors.cyan}[${timestamp()}]${colors.reset} ${colors.green}INFO${colors.reset}  ${message}`, ...args)
    logService.info(message, ...args)
  },

  warn: (message: string, ...args: unknown[]) => {
    console.log(`${colors.cyan}[${timestamp()}]${colors.reset} ${colors.yellow}WARN${colors.reset}  ${message}`, ...args)
    logService.warn(message, ...args)
  },

  error: (message: string, ...args: unknown[]) => {
    console.log(`${colors.cyan}[${timestamp()}]${colors.reset} ${colors.red}ERROR${colors.reset} ${message}`, ...args)
    logService.error(message, ...args)
  },

  debug: (message: string, ...args: unknown[]) => {
    // Respetar el toggle de debug también en consola: sin esto, el stdout
    // (y el server.log del pod) se llena de líneas DEBUG aunque esté apagado.
    if (!isDebugEnabled()) return
    console.log(`${colors.cyan}[${timestamp()}]${colors.reset} ${colors.magenta}DEBUG${colors.reset} ${message}`, ...args)
    logService.debug(message, ...args)
  },

  bot: (message: string, ...args: unknown[]) => {
    console.log(`${colors.cyan}[${timestamp()}]${colors.reset} ${colors.blue}BOT${colors.reset}   ${message}`, ...args)
    logService.bot(message, ...args)
  },
}
