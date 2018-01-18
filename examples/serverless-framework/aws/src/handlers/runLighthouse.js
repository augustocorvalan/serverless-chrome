// https://github.com/GoogleChrome/lighthouse/blob/master/lighthouse-cli/test/smokehouse/smokehouse.js
const path = require('path')
const spawnSync = require('child_process').spawnSync
const log = require('lighthouse-logger')
log.setLevel('info')

const PROTOCOL_TIMEOUT_EXIT_CODE = 67
const RETRIES = 3

/**
 * Attempt to resolve a path locally. If this fails, attempts to locate the path
 * relative to the current working directory.
 * @param {string} payloadPath
 * @return {string}
 */
function resolveLocalOrCwd(payloadPath) {
  let resolved
  try {
    resolved = require.resolve('./' + payloadPath)
  } catch (e) {
    const cwdPath = path.resolve(process.cwd(), payloadPath)
    resolved = require.resolve(cwdPath)
  }

  return resolved
}

/**
 * Launch Chrome and do a full Lighthouse run.
 * @param {string} url
 * @param {string} configPath
 * @param {string=} saveAssetsPath
 * @return {!LighthouseResults}
 */
function runLighthouse(url, configPath, saveAssetsPath) {
  const command = 'lighthouse'
  const args = [
    url,
    '--chrome-flags=--no-sandbox --no-gpu --headless',
    '--output=json',
  ]

  if (configPath !== null) {
    args.push(`--config-path=${configPath}`)
  }

  if (saveAssetsPath) {
    args.push('--save-assets')
    args.push(`--output-path=${saveAssetsPath}`)
  }

  // Lighthouse sometimes times out waiting to for a connection to Chrome in CI.
  // Watch for this error and retry relaunching Chrome and running Lighthouse up
  // to RETRIES times. See https://github.com/GoogleChrome/lighthouse/issues/833
  let runResults
  let runCount = 0
  do {
    if (runCount > 0) {
      console.log(
        '  Lighthouse error: timed out waiting for debugger connection. Retrying...'
      )
    }

    runCount++
    console.log(`${log.dim}$ ${command} ${args.join(' ')} ${log.reset}`)
    runResults = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
    })
  } while (
    runResults.status === PROTOCOL_TIMEOUT_EXIT_CODE &&
    runCount <= RETRIES
  )

  if (runResults.status === PROTOCOL_TIMEOUT_EXIT_CODE) {
    console.error(
      `Lighthouse debugger connection timed out ${RETRIES} times. Giving up.`
    )
    process.exit(1)
  } else if (runResults.status !== 0) {
    console.log('RUN_RES', runResults)
    console.error(
      `Lighthouse run failed with exit code ${
        runResults.status
      }. stderr to follow:`
    )
    console.error(runResults.stderr)
    process.exit(runResults.status)
  }

  if (saveAssetsPath) {
    // If assets were saved, the JSON output was written to the specified path instead of stdout
    return require(resolveLocalOrCwd(saveAssetsPath))
  }

  return JSON.parse(runResults.stdout)
}

module.exports = runLighthouse
