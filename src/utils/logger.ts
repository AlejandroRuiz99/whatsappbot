const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
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
  },
  
  warn: (message: string, ...args: unknown[]) => {
    console.log(`${colors.cyan}[${timestamp()}]${colors.reset} ${colors.yellow}WARN${colors.reset}  ${message}`, ...args)
  },
  
  error: (message: string, ...args: unknown[]) => {
    console.log(`${colors.cyan}[${timestamp()}]${colors.reset} ${colors.red}ERROR${colors.reset} ${message}`, ...args)
  },
  
  debug: (message: string, ...args: unknown[]) => {
    console.log(`${colors.cyan}[${timestamp()}]${colors.reset} ${colors.magenta}DEBUG${colors.reset} ${message}`, ...args)
  },
  
  bot: (message: string, ...args: unknown[]) => {
    console.log(`${colors.cyan}[${timestamp()}]${colors.reset} ${colors.blue}BOT${colors.reset}   ${message}`, ...args)
  },
}
