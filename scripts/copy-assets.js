import { cpSync } from 'fs'
import { join } from 'path'

const assets = [
  { from: 'src/server/sandbox/qr.html', to: 'dist/server/sandbox/qr.html' },
  { from: 'src/server/sandbox/sandbox.html', to: 'dist/server/sandbox/sandbox.html' },
  { from: 'src/server/sandbox/sandbox.js', to: 'dist/server/sandbox/sandbox.js' },
  { from: 'src/server/sandbox/styles.css', to: 'dist/server/sandbox/styles.css' },
  { from: 'src/services/knowledgebase/llm/prompts', to: 'dist/services/knowledgebase/llm/prompts' },
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
