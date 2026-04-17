function normalizeError(error) {
  if (!error) return null;
  return String(error && error.stack ? error.stack : error);
}

function createExecutionReview({
  domain = 'funliday',
  operation = 'unknown',
  ok,
  error,
  context = {},
  signals = {},
} = {}) {
  const reasons = [];
  const suggestedEnhancements = [];
  let shouldEnhance = false;

  if (!ok) {
    if (signals.guardrailTriggered === true) {
      reasons.push('Operation stopped by an intentional safety guardrail.');
      suggestedEnhancements.push('No immediate enhancement required; the guardrail behaved as designed.');
    } else {
      shouldEnhance = true;
      reasons.push('Operation failed during execution.');
      suggestedEnhancements.push('Capture the failure context and harden the shared helper or workflow.');
    }
  }

  if (signals.discoveredNewApi === true) {
    shouldEnhance = true;
    reasons.push('A new or better API behavior was confirmed.');
    suggestedEnhancements.push('Promote the discovery into a shared helper and document the payload/response shape.');
  }

  if (signals.usedUiFallback === true) {
    shouldEnhance = true;
    reasons.push('UI fallback was required to complete the operation.');
    suggestedEnhancements.push('Look for a more stable API or helper abstraction to remove the brittle UI path.');
  }

  if (signals.usedWorkaround === true) {
    shouldEnhance = true;
    reasons.push('A workaround path was required.');
    suggestedEnhancements.push('Fold the workaround into reusable documentation or replace it with a cleaner primitive.');
  }

  if (signals.unexpectedResponseShape === true) {
    shouldEnhance = true;
    reasons.push('The response shape differed from the current reusable assumptions.');
    suggestedEnhancements.push('Expand parser guards and update the shared contract documentation.');
  }

  if (signals.validationRejected === true) {
    shouldEnhance = true;
    reasons.push('Validation rejected the payload or plan before execution.');
    suggestedEnhancements.push('Tighten authoring guidance or extend validation hints for faster recovery.');
  }

  if (signals.manualFollowUp === true) {
    shouldEnhance = true;
    reasons.push('Manual follow-up is still needed after this run.');
    suggestedEnhancements.push('Automate the missing follow-up step if it is safe and repeatable.');
  }

  if (signals.reusedExistingResource === true && ok) {
    reasons.push('An existing resource was safely reused.');
  }

  if (signals.networkCaptureRecorded === true) {
    reasons.push('Network capture was recorded for traceability.');
  }

  if (signals.sharedHelperUsed === true && ok) {
    reasons.push('The shared helper covered the operation successfully.');
  }

  if (reasons.length === 0 && ok) {
    reasons.push('Operation completed with the current reusable feature set.');
  }

  if (suggestedEnhancements.length === 0) {
    suggestedEnhancements.push(shouldEnhance ? 'Review this run and evolve the shared surface if the pattern is repeatable.' : 'No enhancement needed right now.');
  }

  return {
    reviewedAt: new Date().toISOString(),
    domain,
    operation,
    outcome: ok ? 'success' : 'failure',
    shouldEnhance,
    reasons,
    suggestedEnhancements,
    error: ok ? null : normalizeError(error),
    context,
    signals,
  };
}

function summarizeExecutionReviews(reviews = []) {
  const total = reviews.length;
  const successCount = reviews.filter((item) => item.outcome === 'success').length;
  const failureCount = reviews.filter((item) => item.outcome === 'failure').length;
  const shouldEnhanceCount = reviews.filter((item) => item.shouldEnhance === true).length;

  return {
    total,
    successCount,
    failureCount,
    shouldEnhanceCount,
    stableCount: total - shouldEnhanceCount,
  };
}

module.exports = {
  createExecutionReview,
  summarizeExecutionReviews,
};

