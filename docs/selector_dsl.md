# Selector DSL

Selectors are used to find POIs in mutation plans.

## Basic selectors

- `id`
- `name`
- `address`
- `daySequence`
- `seq`
- `customizeStartTime`
- `stayTime`
- `hasNote`
- `alias`

## Rich matching

- `nameContains`
- `nameStartsWith`
- `nameEndsWith`
- `nameRegex`
- `addressContains`
- `addressRegex`
- `daySequenceIn`
- `seqGte`
- `seqLte`

## Cardinality helpers

- `first: true`
- `last: true`
- `nth: 0`
- `limit: 3`

## Composite selectors

- `all: [ ... ]`
- `any: [ ... ]`
- `not: { ... }`

## Example

```json
{
  "all": [
    { "daySequence": 1 },
    { "nameContains": "Bund" }
  ],
  "first": true
}
```

