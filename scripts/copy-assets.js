import { cpSync } from 'fs'
import { join } from 'path'

const assets = [
  { from: 'src/server/sandbox/qr.html', to: 'dist/server/sandbox/qr.html' },
  { from: 'src/server/sandbox/sandbox.html', to: 'dist/server/sandbox/sandbox.html' },
  { from: 'src/server/sandbox/sandbox.js', to: 'dist/server/sandbox/sandbox.js' },
  { from: 'src/server/sandbox/styles.css', to: 'dist/server/sandbox/styles.css' },
  { from: 'src/services/knowledgebase/llm/prompts', to: 'dist/services/knowledgebase/llm/prompts' },
]

const root = process.cwd()

for (const { from, to } of assets) {
  cpSync(join(root, from), join(root, to), { recursive: true })
  console.log(`Copied: ${from} -> ${to}`)
}
