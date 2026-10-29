export const main = {
  engineNotFound: 'Analysis engine not found: {{binary}}. Run scripts/build-sidecar.sh first.',
  engineNoOptions: 'The analysis engine returned no option data',
  engineNoMarketData: 'The analysis engine returned no market data',
  keychainUnavailable: 'The system keychain is unavailable, so keys cannot be stored safely',
  engineStartFailed: 'Could not start the analysis engine: {{message}}',
  updateHttpError: 'The update server responded with HTTP {{status}}',
  updateBadManifest: 'The update information is malformed',
  updateChecksumMismatch: 'The download failed verification and may be incomplete. Please retry.',
  updateBadPackage: 'No application was found in the update package',
  updateNotInstallable: 'Updates cannot be installed in this build',
  updateNotReplaceable:
    'The app’s folder is not writable, so it cannot be replaced automatically. The new version is shown in Finder; drag it into Applications.',
  updateInterruptMessage: 'An analysis is still running and installing now will stop it',
  updateInterruptDetail: 'The app will close, install v{{version}} and reopen when done.',
  updateInterruptConfirm: 'Stop analysis and install',
  updateInterruptCancel: 'Later'
}
