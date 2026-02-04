// Lista temporal de clientes existentes (numeros guardados)
// En futuras iteraciones: consultar CRM/BD
const EXISTING_CLIENTS = new Set([
  '34612345678',
  '34698765432',
  // Agrega aqui los numeros de clientes existentes
])

export function isExistingClient(phone: string): boolean {
  const normalized = phone.replace(/\D/g, '')
  return EXISTING_CLIENTS.has(normalized)
}

export function addExistingClient(phone: string): void {
  const normalized = phone.replace(/\D/g, '')
  EXISTING_CLIENTS.add(normalized)
}

export function removeExistingClient(phone: string): void {
  const normalized = phone.replace(/\D/g, '')
  EXISTING_CLIENTS.delete(normalized)
}
