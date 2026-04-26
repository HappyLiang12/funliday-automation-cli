const { readFileSync } = require('fs');
const path = require('path');
const { runMutationPlan } = require('../plan/mutation-runner');
const { validateMutationPlan } = require('../plan/validator');
const { resolveArtifactPath, writeJson } = require('../io/paths');
const { DEFAULT_CDP_ENDPOINT } = require('../auth/browser-session');
const { parseCommonFlags, resolveAuthInput, printCliSuccess } = require('./shared');

function printMutateUsage() {
  console.log(`Funliday Mutation CLI\n\nUsage:\n  funliday-mutate run <plan.json> [--dry-run] [--trip-snapshot <file>] [--endpoint <url>] [--output <file>] [--auth-file <file> | --env-auth] [--quiet]\n  funliday-mutate validate <plan.json> [--output <file>] [--quiet]\n\nFlags:\n  --dry-run             simulate operations without calling mutating endpoints\n  --trip-snapshot FILE  use a saved trip snapshot (from \`funliday-api getPoisOfTrip\` output) for fully offline dry-run; implies --dry-run`);
}

function parseMutateArgs(argv) {
  const subcommand = argv[0];
  if (!subcommand || ['help', '--help', '-h'].includes(subcommand)) return { subcommand: 'help' };
  const { options: common, rest } = parseCommonFlags(argv.slice(1));
  let planPath = '';
  let positionalOutputPath = '';
  let dryRun = false;
  let validateOnly = false;
  let tripSnapshotPath = '';
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (['help', '--help', '-h'].includes(arg)) return { subcommand: 'help' };
    if (arg === '--dry-run') { dryRun = true; continue; }
    if (arg === '--validate-only') { validateOnly = true; continue; }
    if (arg === '--trip-snapshot') { tripSnapshotPath = rest[index + 1] || ''; index += 1; dryRun = true; continue; }
    if (!planPath) { planPath = arg; continue; }
    if (!positionalOutputPath) { positionalOutputPath = arg; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!planPath && subcommand !== 'help') throw new Error('A mutation plan path is required.');
  return {
    subcommand,
    planPath: planPath ? path.resolve(planPath) : '',
    endpoint: common.endpoint || DEFAULT_CDP_ENDPOINT,
    outputPath: common.outputPath || positionalOutputPath,
    dryRun,
    validateOnly,
    tripSnapshotPath: tripSnapshotPath ? path.resolve(tripSnapshotPath) : '',
    authFile: common.authFile,
    useEnvAuth: common.useEnvAuth,
    quiet: common.quiet,
    debug: common.debug,
  };
}

function loadTripSnapshot(snapshotPath) {
  const raw = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  if (raw && raw.response && raw.response.results) return raw.response.results;
  if (raw && raw.results) return raw.results;
  if (raw && Array.isArray(raw.pois)) return raw;
  if (raw && raw.trip && Array.isArray(raw.trip.pois)) return raw.trip;
  throw new Error(`Trip snapshot at ${snapshotPath} does not contain a recognizable trip object (expected .pois[] or response.results.pois[]).`);
}

async function runMutateCli(argv) {
  const parsed = parseMutateArgs(argv);
  if (parsed.subcommand === 'help') {
    printMutateUsage();
    return { ok: true, subcommand: 'help' };
  }

  const plan = JSON.parse(readFileSync(parsed.planPath, 'utf8'));
  plan.__planPath = parsed.planPath;
  if (parsed.tripSnapshotPath) {
    plan.tripSnapshot = loadTripSnapshot(parsed.tripSnapshotPath);
  }
  const finalOutputPath = parsed.outputPath || resolveArtifactPath('mutations', `${path.basename(parsed.planPath, path.extname(parsed.planPath))}_output.json`);

  if (parsed.subcommand === 'validate' || parsed.validateOnly) {
    const validation = validateMutationPlan(plan);
    const payload = { planPath: parsed.planPath, ok: validation.ok, errors: validation.errors };
    writeJson(finalOutputPath, payload);
    if (!validation.ok) {
      process.exitCode = 1;
      const errLine = validation.errors.map((item) => `  - ${item.path}: ${item.message}`).join('\n');
      printCliSuccess(`INVALID plan (${validation.errors.length} error${validation.errors.length === 1 ? '' : 's'}) → ${finalOutputPath}\n${errLine}`, { quiet: parsed.quiet });
    } else {
      printCliSuccess(`Valid plan: ${parsed.planPath} → ${finalOutputPath}`, { quiet: parsed.quiet });
    }
    return payload;
  }

  if (parsed.subcommand !== 'run') throw new Error(`Unsupported mutate subcommand: ${parsed.subcommand}`);
  const result = await runMutationPlan({
    plan,
    endpoint: parsed.endpoint,
    dryRun: parsed.dryRun,
    outputPath: finalOutputPath,
    auth: resolveAuthInput(parsed),
  });
  const opCount = Array.isArray(result.operations) ? result.operations.length : 0;
  const planOpCount = Array.isArray(plan.operations) ? plan.operations.length : opCount;
  const tag = parsed.dryRun ? (parsed.tripSnapshotPath ? 'DRY-RUN(offline)' : 'DRY-RUN') : 'LIVE';
  printCliSuccess(`OK [${tag}]: ${opCount}/${planOpCount} operations → ${finalOutputPath}`, { quiet: parsed.quiet });
  return result;
}

module.exports = {
  parseMutateArgs,
  printMutateUsage,
  loadTripSnapshot,
  runMutateCli,
};
