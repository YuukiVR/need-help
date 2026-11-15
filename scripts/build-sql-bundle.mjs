#!/usr/bin/env node
/**
 * Build one paste-able SQL file from supabase/migrations/.
 *
 *   node scripts/build-sql-bundle.mjs
 *
 * Use it when the Supabase CLI is not available (or `supabase login` fails):
 * paste supabase/sql/apply-all.sql into the dashboard SQL Editor once.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const outputFile = join(process.cwd(), 'supabase', 'sql', 'apply-all.sql')

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b))

if (files.length === 0) {
  console.error(`No migrations found in ${migrationsDir}`)
  process.exit(1)
}

const parts = [
  '-- NeedHelp schema bundle: migrations in order, ready for the SQL Editor.',
  '-- Paste this whole file into Supabase → SQL Editor and run it once, when',
  '-- you cannot use the Supabase CLI (`supabase db push`).',
  '--',
  '-- Generated from supabase/migrations/. Do not edit by hand — change the',
  '-- migration and run: node scripts/build-sql-bundle.mjs',
]

for (const file of files) {
  const sql = await readFile(join(migrationsDir, file), 'utf8')
  parts.push('')
  parts.push('-- =====================================================================')
  parts.push(`-- ${file}`)
  parts.push('-- =====================================================================')
  parts.push(sql.trimEnd())
}

await writeFile(outputFile, `${parts.join('\n')}\n`, 'utf8')

console.log(`Wrote ${outputFile}`)
console.log(`Bundled ${files.length} migrations:`)
for (const file of files) console.log(`  ${file}`)
