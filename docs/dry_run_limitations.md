# Dry-run behavior and limitations

## Current behavior

This package simulates alias-based plans more faithfully than the original workspace by registering synthetic POIs and alias IDs during dry-run.

## What dry-run is good for

- validating plan structure
- previewing operation sequencing
- checking selector behavior against virtual state
- checking alias-based follow-up operations

## What dry-run is not

Dry-run is not a guarantee that Funliday production behavior will match exactly.

Possible differences:

- server-side validation rules
- response ordering
- hidden API side effects
- undocumented endpoint behavior changes

## Best practice

1. `funliday-plan-validate`
2. `funliday-mutate run --dry-run`
3. review output
4. run live only if the plan looks correct

