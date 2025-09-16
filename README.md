# flagged-bitfield

Type-safe flagged bitfield utility for TypeScript/JavaScript using bigint under the hood. Provides a clean API for combining, testing, and transforming named flags with excellent IntelliSense support via TSDoc.

- Tiny, dependency-free
- Type-safe flag names via generics
- Mutable and immutable-style operations
- Mask-aware and bigint-based for large flag sets

## Installation

```bash
npm install @eliyya/flagged-bitfield
```

## Quick start

```ts
import { FlaggedBitfield } from '@eliyya/flagged-bitfield'

// 1) Define your flags by extending the class
class Permissions extends FlaggedBitfield<typeof Permissions.Flags> {
    static Flags = {
        Read: 1n,
        Write: 2n,
        Execute: 4n,
        Admin: 8n,
    } as const
}

// 2) Create instances
const p = new Permissions(['Read', 'Write'])

// 3) Test and manipulate
p.has('Read') // true
p.has('Execute') // false

// Mutating operations
p.add('Execute')
p.remove('Write')
p.invert() // invert bits within the mask

// Immutable-style operations (return a new instance)
const q = p.with('Admin').without('Read')

// Interop
q.toArray() // => ['Admin', 'Execute'] (order by bit value)
q.toObject() // => { Read: false, Write: false, Execute: true, Admin: true }
q.toString(2) // => binary string of the bigint
q.toNumber() // => numeric representation (may truncate for huge values)
```

## API overview

The class exposes both mutating and non-mutating methods. All operations respect the mask derived from your `Flags` definition.

- Mutable methods
    - `add(bit)`
    - `remove(bit)`
    - `invert()`
    - `freeze()` (turns the instance into a read-only, no-op for mutations)

- Immutable methods (return a new instance)
    - `with(bit)`
    - `without(bit)`
    - `missing()` (complement within the mask)
    - `union(bit)` (alias of `with`)
    - `intersection(bit)`
    - `difference(bit)`
    - `symmetricDifference(bit)`
    - `complement()`

- Queries and utilities
    - `has(bit)` — any overlap
    - `equals(bit)` — exact equality
    - `any(bit)` — intersection != 0n
    - `getFlags()` — returns the flags definition
    - `isFrozen()`
    - `toArray()`
    - `toObject()`
    - `toJSON()`
    - `toString(radix?)`
    - `toNumber()`
    - Iteration support: `[Symbol.iterator]()` yields present flags in ascending bit order
    - Helpers: `find`, `findIndex`, `forEach`, `map`, `entries`, `keys`, `values`

### Accepted bit inputs

Most methods accept any of the following as a bit input:

- A single flag key (e.g., `'Read'`)
- A numeric `number` or `bigint` value
- An array of the above
- Another `FlaggedBitfield` instance

## Advanced usage

### Freezing instances

```ts
const frozen = p.freeze()
frozen.add('Admin') // no-op, still frozen
frozen.isFrozen() // true
```

### Custom default bit

```ts
class Defaults extends FlaggedBitfield<typeof Defaults.Flags> {
    static Flags = { A: 1n, B: 2n, C: 4n } as const
    static DefaultBit = 1n // Start with flag A enabled
}

const d = new Defaults() // bitfield starts at 1n
```

### Working with raw numbers/bigints

```ts
const x = new Permissions(0b101n) // Read + Execute
x.has(['Read', 'Execute']) // true
x.equals(['Read', 'Execute']) // true
```

### Combining sets

```ts
const a = new Permissions(['Read'])
const b = new Permissions(['Write'])

const union = a.union(b) // Read | Write
const inter = union.intersection(a) // Read
const diff = union.difference(a) // Write
const symDiff = a.symmetricDifference(b) // Read ^ Write
```

## TypeScript notes

- All bits are normalized to `bigint` internally.
- The mask is computed from your `Flags` object: `Object.values(Flags)` OR-reduced.
- Ordering for iteration and derived arrays is ascending by bit value.

## Contributing

Issues and PRs are welcome! Please open an issue first to discuss major changes.

## License

MIT
