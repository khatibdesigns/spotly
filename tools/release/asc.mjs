// Spotly — App Store Connect release steps that ship-ios.sh does not cover.
//
// ship-ios.sh archives, exports and uploads the IPA. That leaves the binary sitting in
// App Store Connect attached to nothing: the version is still PREPARE_FOR_SUBMISSION and
// nobody is reviewing anything. This is the rest of it — wait for processing, attach the
// build to the version, and submit.
//
//   node tools/release/asc.mjs status     what state the version and build are in
//   node tools/release/asc.mjs notes      print the release notes it would write
//   node tools/release/asc.mjs notes --apply
//   node tools/release/asc.mjs submit     attach the build and submit for review
//
// Version and build are read from ios/Spotly/Info.plist — the same source ship-ios.sh
// uses — so this cannot submit a different build from the one that was uploaded.
import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const KEY_ID = process.env.ASC_KEY_ID || '3N8W57HBHM'
const ISSUER = process.env.ASC_ISSUER || '69a6de89-0c8c-47e3-e053-5b8c7c11a4d1'
const BUNDLE = 'com.khd.spotly'
const KEY_PATH = `${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`

const plist = (k) =>
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${k}`, 'ios/Spotly/Info.plist'], { encoding: 'utf8' }).trim()
const VERSION = plist('CFBundleShortVersionString')
const BUILD = plist('CFBundleVersion')

function jwt() {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
  const body = b64({ iss: ISSUER, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })
  // ASC needs ES256 with a JOSE (r||s) signature. Node emits DER by default, which the
  // API rejects with a bare 401 and no hint — dsaEncoding is the whole difference.
  const sig = createSign('SHA256').update(`${head}.${body}`)
    .sign({ key: readFileSync(KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' }, 'base64url')
  return `${head}.${body}.${sig}`
}

const JWT = jwt()
async function api(path, opts = {}) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const text = await r.text()
  let json = {}
  try { json = text ? JSON.parse(text) : {} } catch {}
  if (!r.ok) throw new Error(`${r.status} ${path} — ${JSON.stringify(json.errors || text).slice(0, 300)}`)
  return json
}

async function resolve() {
  const app = (await api(`/v1/apps?filter[bundleId]=${BUNDLE}`)).data?.[0]
  if (!app) throw new Error(`no app for ${BUNDLE}`)
  const version = (await api(`/v1/apps/${app.id}/appStoreVersions?filter[versionString]=${VERSION}&limit=1`)).data?.[0]
  if (!version) throw new Error(`version ${VERSION} does not exist in App Store Connect — create it there first`)
  return { app, version }
}

async function waitForBuild(appId) {
  for (let i = 0; i < 40; i++) {
    const b = (await api(`/v1/builds?filter[app]=${appId}&filter[version]=${BUILD}&limit=1`)).data?.[0]
    const state = b?.attributes?.processingState
    if (state === 'VALID') return b
    if (state === 'INVALID' || state === 'FAILED') throw new Error(`build ${BUILD} came back ${state}`)
    console.log(`build ${BUILD}: ${state || 'not uploaded yet'} — waiting (${i + 1}/40)`)
    await new Promise((r) => setTimeout(r, 30000))
  }
  throw new Error(`build ${BUILD} never reached VALID`)
}

// Release notes. Apple blocks an update with an empty whatsNew, and the failure reads as
// a generic "not ready" rather than naming the field, so it is worth checking explicitly.
const NOTES = `Plan the day your way
• Tell Spotly what matters — halal, no alcohol, quieter places, nature or food — and it plans around it.
• Don't like a suggestion? Swap it for another without starting over.
• Get a nudge when it's time to leave, and let Spotly re-time the rest of your day if you run late.

Know before you go
• Place pages now show opening hours, phone, website and Google reviews.

Memories
• A smoother way to pick photos, name an album and order it.
• Clearer gallery capture, with photo counts.

Family & account
• Invite your family with a shareable card.
• Manage your membership, and delete your account, from Profile.

Also: Arabic throughout, and a fix for notifications not reaching some families.`

const cmd = process.argv[2] || 'status'
const APPLY = process.argv.includes('--apply') || process.argv.includes('--submit')

if (cmd === 'status') {
  const { app, version } = await resolve()
  console.log(`app: ${app.attributes.name} (${app.id})`)
  console.log(`version ${VERSION}: ${version.attributes.appStoreState}  releaseType=${version.attributes.releaseType}`)
  const locs = (await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=20`)).data || []
  for (const l of locs) {
    const w = (l.attributes.whatsNew || '').trim()
    console.log(`  ${l.attributes.locale.padEnd(8)} whatsNew: ${w ? `${w.length} chars` : '*** EMPTY — blocks submission ***'}`)
  }
  const b = (await api(`/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD}&limit=1`)).data?.[0]
  console.log(`build ${BUILD}: ${b?.attributes?.processingState || 'not uploaded'} expired=${b?.attributes?.expired} encryption=${b?.attributes?.usesNonExemptEncryption}`)
  const subs = (await api(`/v1/apps/${app.id}/reviewSubmissions?limit=5`)).data || []
  subs.forEach((s) => console.log(`  submission ${s.id} ${s.attributes?.state}`))
} else if (cmd === 'notes') {
  const { version } = await resolve()
  console.log(`${NOTES.length} chars (Apple allows 4000)\n${NOTES}\n`)
  if (!APPLY) { console.log('Dry run — pass --apply to write it.'); process.exit(0) }
  const locs = (await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=20`)).data || []
  for (const l of locs) {
    await api(`/v1/appStoreVersionLocalizations/${l.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: { whatsNew: NOTES } } }),
    })
    console.log(`set whatsNew for ${l.attributes.locale}`)
  }
} else if (cmd === 'submit') {
  const { app, version } = await resolve()
  const build = await waitForBuild(app.id)
  if (!APPLY) { console.log(`would attach build ${BUILD} to ${VERSION} and submit. Pass --submit.`); process.exit(0) }
  await api(`/v1/appStoreVersions/${version.id}/relationships/build`, {
    method: 'PATCH', body: JSON.stringify({ data: { type: 'builds', id: build.id } }),
  })
  const sub = await api('/v1/reviewSubmissions', {
    method: 'POST',
    body: JSON.stringify({ data: { type: 'reviewSubmissions', relationships: { app: { data: { type: 'apps', id: app.id } } } } }),
  }).catch(async (e) => {
    // A submission is already open — reuse it rather than failing the release.
    if (!String(e.message).includes('409')) throw e
    const open = (await api(`/v1/apps/${app.id}/reviewSubmissions?filter[state]=READY_FOR_REVIEW,IN_PROGRESS&limit=1`)).data || []
    if (!open[0]) throw e
    return { data: open[0] }
  })
  await api('/v1/reviewSubmissionItems', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.data.id } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
        },
      },
    }),
  })
  await api(`/v1/reviewSubmissions/${sub.data.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'reviewSubmissions', id: sub.data.id, attributes: { submitted: true } } }),
  })
  console.log(`SUBMITTED ${VERSION} (build ${BUILD}) for App Store review`)
} else {
  console.log('usage: node tools/release/asc.mjs [status|notes|submit] [--apply|--submit]')
  process.exit(1)
}
