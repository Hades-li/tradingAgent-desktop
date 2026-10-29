/**
 * Platform installers. Both hand off to a detached process and quit; neither
 * relies on code signing, which is why macOS cannot use Squirrel.Mac here.
 */

import { execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { app, shell } from 'electron'
import { mainT } from '../i18n'
import { isTranslocated, macBundlePath } from './manifest'

const execFileAsync = promisify(execFile)

/** Resolve once the OS has started the child, so we never quit into a failed spawn. */
function launchDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

/**
 * Silent NSIS run: `--updated` tells electron-builder's installer this is an
 * update (it closes any lingering instance itself), `--force-run` relaunches
 * the app when it is done.
 */
async function installWindows(installer: string): Promise<void> {
  await launchDetached(installer, ['--updated', '/S', '--force-run'])
  app.quit()
}

/**
 * Waits for the app to exit, swaps the bundle (keeping a backup until the new
 * one is in place) and relaunches whichever copy survived.
 */
const SWAP_SCRIPT = `#!/bin/sh
pid="$1"; target="$2"; source="$3"
backup="$target.update-backup"
waited=0
while kill -0 "$pid" 2>/dev/null; do
  waited=$((waited + 1))
  [ "$waited" -gt 600 ] && exit 1
  sleep 0.1
done
rm -rf "$backup"
if ! mv "$target" "$backup"; then
  open "$target"
  exit 1
fi
if mv "$source" "$target"; then
  rm -rf "$backup"
else
  rm -rf "$target"
  mv "$backup" "$target"
fi
open "$target"
`

async function installMac(zip: string, workDir: string): Promise<void> {
  const bundle = macBundlePath(process.execPath)
  if (!bundle) throw new Error(mainT()('updateNotInstallable'))

  const staging = join(workDir, 'staging')
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  // ditto, not unzip: it keeps the bundle's symlinks and ad-hoc signature intact.
  await execFileAsync('/usr/bin/ditto', ['-x', '-k', zip, staging])
  const name = (await readdir(staging)).find((entry) => entry.endsWith('.app'))
  if (!name) throw new Error(mainT()('updateBadPackage'))
  const fresh = join(staging, name)
  // Written by us rather than a browser, so it should carry no quarantine flag;
  // clear it anyway, since a quarantined sidecar silently refuses to start.
  await execFileAsync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', fresh]).catch(() => undefined)

  const writable = await access(dirname(bundle), constants.W_OK).then(
    () => true,
    () => false
  )
  if (isTranslocated(bundle) || !writable) {
    shell.showItemInFolder(fresh)
    throw new Error(mainT()('updateNotReplaceable'))
  }

  const script = join(workDir, 'swap.sh')
  await writeFile(script, SWAP_SCRIPT, { mode: 0o755 })
  await launchDetached('/bin/sh', [script, String(process.pid), bundle, fresh])
  app.quit()
}

export async function installUpdate(file: string, workDir: string): Promise<void> {
  if (!app.isPackaged) throw new Error(mainT()('updateNotInstallable'))
  if (process.platform === 'win32') return installWindows(file)
  if (process.platform === 'darwin') return installMac(file, workDir)
  throw new Error(mainT()('updateNotInstallable'))
}
