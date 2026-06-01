import { cpSync } from 'fs'
import { join } from 'path'

const assets = [
  // Sandbox channel
  { from: 'src/channels/sandbox/qr.html', to: 'dist/channels/sandbox/qr.html' },
  { from: 'src/channels/sandbox/sandbox.html', to: 'dist/channels/sandbox/sandbox.html' },
  { from: 'src/channels/sandbox/sandbox.js', to: 'dist/channels/sandbox/sandbox.js' },
  { from: 'src/channels/sandbox/styles.css', to: 'dist/channels/sandbox/styles.css' },
  // LLM prompts
  { from: 'src/knowledge/llm/prompts', to: 'dist/knowledge/llm/prompts' },
  // Admin panel
  { from: 'src/server/admin/admin.html', to: 'dist/server/admin/admin.html' },
  { from: 'src/server/admin/admin.js', to: 'dist/server/admin/admin.js' },
  { from: 'src/server/admin/admin.css', to: 'dist/server/admin/admin.css' },
]

const root = process.cwd()

for (const { from, to } of assets) {
  cpSync(join(root, from), join(root, to), { recursive: true })
  console.log(`Copied: ${from} -> ${to}`)
}
