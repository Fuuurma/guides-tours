#!/usr/bin/env node
/**
 * Pre-deploy readiness check. Reports missing env vars without printing values.
 *
 * Two-sided check:
 *  - Local .env (deploy creds + frontend build vars)
 *  - Convex prod env (auth, billing, email, encryption)
 *
 * NOTE on AWS env name drift:
 *   This repo's code reads AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
 *   SES_FROM_ADDRESS (no `AWS_SES_` prefix; `SES_FROM_ADDRESS` not `SES_FROM_EMAIL`).
 *   See docs/EDGE-RUNTIME.md and the .env.example comment. The check below checks
 *   the names the code actually reads.
 */

import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

function loadEnvFile(filename) {
  const path = resolve(root, filename)
  if (!existsSync(path)) return {}
  const vars = {}
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    vars[key] = value
  }
  return vars
}

function getLocalEnv(key, files) {
  if (process.env[key]?.trim()) return process.env[key].trim()
  for (const fileVars of files) {
    if (fileVars[key]?.trim()) return fileVars[key].trim()
  }
  return ""
}

function convexProdHas(key) {
  try {
    const value = execSync(`npx convex env get --prod ${key}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
    return value.length > 0
  } catch {
    return false
  }
}

const fileVars = [loadEnvFile(".env.local"), loadEnvFile(".env")]

const groups = [
  {
    label: "Deploy credentials (local .env)",
    keys: ["CONVEX_DEPLOY_KEY", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    check: (key) => getLocalEnv(key, fileVars),
  },
  {
    label: "Frontend build (local .env)",
    keys: ["VITE_CONVEX_URL", "VITE_CONVEX_SITE_URL", "VITE_SITE_URL"],
    check: (key) => getLocalEnv(key, fileVars),
  },
  {
    label: "Convex prod — required for auth",
    keys: ["BETTER_AUTH_SECRET", "SITE_URL", "ENCRYPTION_KEY"],
    check: (key) => (convexProdHas(key) ? "set" : ""),
  },
  {
    label: "Convex prod — email (Amazon SES)",
    keys: ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "SES_FROM_ADDRESS"],
    check: (key) => (convexProdHas(key) ? "set" : ""),
  },
  {
    label: "Convex prod — billing (Stripe)",
    keys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PUBLISHABLE_KEY"],
    check: (key) => (convexProdHas(key) ? "set" : ""),
  },
  {
    label: "Convex prod — OTA (optional, only needed if integrating)",
    keys: [
      "OTA_VIATOR_API_KEY",
      "OTA_GETYOURGUIDE_API_KEY",
      "OTA_AIRBNB_API_KEY",
      "OTA_TRIPADVISOR_API_KEY",
      "OTA_KLOOK_API_KEY",
      "OTA_BOOKING_API_KEY",
      "OTA_EXPEDIA_API_KEY",
    ],
    check: (key) => (convexProdHas(key) ? "set" : ""),
  },
]

let missing = 0
let missingOta = 0

console.log("Deploy readiness — guides-tours\n")
console.log(
  "Convex deploy needs CONVEX_DEPLOY_KEY (non-interactive) or `npx convex deploy` (interactive)\n",
)

for (const group of groups) {
  console.log(`── ${group.label} ──`)
  for (const key of group.keys) {
    if (group.check(key)) {
      console.log(`  ✓ ${key}`)
    } else {
      const isOta = group.label.startsWith("Convex prod — OTA")
      if (isOta) missingOta++
      else missing++
      console.log(`  ${isOta ? "○" : "✗"} ${key} — missing${isOta ? " (optional)" : ""}`)
    }
  }
  console.log()
}

const blocking = missing
if (blocking === 0 && missingOta === 0) {
  console.log("All checked vars present (incl. OTA). Run: pnpm deploy")
  process.exit(0)
}
if (blocking === 0) {
  console.log(
    `${missingOta} optional OTA var(s) missing — fine if you don't need OTA integrations.`,
  )
  console.log("All required vars present. Run: pnpm deploy")
  process.exit(0)
}

console.log(`${blocking} required var(s) missing. See README § Deploying to production.`)
console.log("Tip: pnpm convex env set --prod <KEY> <value> for Convex secrets.")
process.exit(1)
