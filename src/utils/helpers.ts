/**
 * Utilidades compartidas entre módulos
 * Evita duplicar sleep/pickRandom/randomBetween en cada archivo
 */

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Formats a 9-digit Spanish mobile number as "XXX XX XX XX".
 * Returns the input unchanged if it does not match the expected shape.
 */
export function formatSpanishMobile(digits: string): string {
  if (!/^\d{9}$/.test(digits)) return digits
  return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`
}
