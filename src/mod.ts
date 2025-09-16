/**
 * A map of flag names to bit values. Values should be powers of two and can be
 * provided as `number` or `bigint`. Internally everything is handled as `bigint`.
 *
 * Example:
 * ```ts
 * export const MyFlags = {
 *   Read: 1n << 0n,
 *   Write: 1n << 1n,
 *   Execute: 1n << 2n,
 * } as const;
 * ```
 */
export type Flags = Record<string, bigint | number>

/**
 * Internal constructor/type shape used by instances to reference their class-level
 * `Flags`, `DefaultBit`, and static helpers.
 */
type IFlaggedBitfield<T extends Flags> = {
    new (bits?: Bit<T>): FlaggedBitfieldClass<T>
    Flags: T
    DefaultBit: bigint
    resolve<T extends Flags>(bits: Bit<T>): bigint
    getMaxBit(): bigint
    getMask(): bigint
}

/**
 * Read-only view of a `FlaggedBitfield` instance after calling {@link FlaggedBitfield.freeze}.
 * It exposes only immutable-style methods.
 */
interface FrozenFlaggedBitfield<T extends Flags> {
    readonly bitfield: bigint

    /**
     * Check if any of the provided bits are present in this bitfield.
     */
    has(bit: Bit<T>): boolean
    /**
     * Return a new instance with the provided bits set (does not mutate this instance).
     */
    with(bit: Bit<T>): this
    /**
     * Return a new instance with the provided bits cleared (does not mutate this instance).
     */
    without(bit: Bit<T>): this
    /**
     * Return a new instance with all missing bits (relative to the defined mask) turned on.
     */
    missing(): this
    /** Alias of {@link with} (set union). */
    union(bit: Bit<T>): this
    /** Return the intersection with the provided bits. */
    intersection(bit: Bit<T>): this
    /** Return the difference with the provided bits (A \ B). */
    difference(bit: Bit<T>): this
    /** Return the symmetric difference with the provided bits (A XOR B). */
    symmetricDifference(bit: Bit<T>): this
    /** Return the complement of this bitfield (missing bits within the mask). */
    complement(): this
    /**
     * Strict equality between this bitfield and the provided bits.
     */
    equals(bit: Bit<T>): boolean
    /**
     * Check if there is any overlap with the provided bits (intersection != 0).
     */
    any(bit: Bit<T>): boolean
    /** Get the flags definition used by this instance. */
    getFlags(): T
    isFrozen(): boolean
    toArray(): (keyof T)[]
    toJSON(): string
    toString(): string
    /**
     * Convert to an object where each flag key maps to a boolean indicating if
     * it is present in this bitfield.
     */
    toObject(): Record<keyof T, boolean>
    [Symbol.iterator](): IterableIterator<keyof T>
    /** Find the first flag that matches the predicate, or undefined. */
    find(predicate: (flag: keyof T) => boolean): keyof T | undefined
    /** Find the index of the first flag that matches the predicate, or -1. */
    findIndex(predicate: (flag: keyof T) => boolean): number
    /** Iterate all present flags, invoking the callback for each. */
    forEach(callback: (flag: keyof T) => void): void
    /** Map over all present flags and return an array of results. */
    map<R>(callback: (flag: keyof T) => R): R[]
    /** Return the entries [flag, value] for all known flags sorted by bit value. */
    entries(): [keyof T, bigint][]
    /** Return only the flag keys. */
    keys(): (keyof T)[]
    /** Return only the flag bigint values. */
    values(): bigint[]
}

/**
 * Mutable interface for `FlaggedBitfield`, extending the frozen/read-only view
 * with mutating operations.
 */
interface FlaggedBitfieldClass<T extends Flags>
    extends FrozenFlaggedBitfield<T> {
    /**
     * Freeze this instance in-place, turning all mutating operations into no-ops
     * and returning a read-only view (`FrozenFlaggedBitfield`).
     *
     * Note: `freeze()` mutates the instance by marking it frozen and invoking
     * `Object.freeze(this)`. After freezing, `add`, `remove`, and `invert` will
     * not modify the bitfield (they will return the same instance unchanged).
     */
    freeze(): FrozenFlaggedBitfield<T>
    /** Add the provided bits to this bitfield (mutates). */
    add(bit: Bit<T>): this
    /** Remove the provided bits from this bitfield (mutates). */
    remove(bit: Bit<T>): this
    /** Invert this bitfield within the current mask (mutates). */
    invert(): this
}

/**
 * A single bit input accepted by most APIs in this module.
 * - A numeric/BigInt bit value
 * - A flag name from `T`
 * - A string (treated as a potential flag key)
 * - Another `FlaggedBitfield` instance
 */
type FlatBit<T extends Flags> =
    | number
    | bigint
    | keyof T
    | (string & {})
    | FlaggedBitfieldClass<T>
/** A single bit or an array of bits. */
type Bit<T extends Flags> = FlatBit<T> | FlatBit<T>[]

/**
 * Safe `in` utility that ignores prototype chain.
 */
function safeIn(ob: object, key: string | number | symbol) {
    return Object.prototype.hasOwnProperty.call(ob, key)
}

/**
 * A type-safe, mask-aware bitfield with both mutable and immutable-style operations.
 *
 * - Mutable methods: {@link add}, {@link remove}, {@link invert}, {@link freeze}
 * - Immutable methods (return new instances): {@link with}, {@link without}, {@link missing},
 *   {@link union}, {@link intersection}, {@link difference}, {@link symmetricDifference}, {@link complement}
 *
 * Instances can be frozen via {@link freeze} to prevent further mutations. All calculations
 * respect the mask derived from the provided `Flags` definition.
 *
 * @typeParam T - A record of flag names mapped to bit values (powers of two).
 *
 * @example
 * ```ts
 * class Permissions extends FlaggedBitfield<typeof Permissions.Flags> {
 *   static Flags = { Read: 1n << 0n, Write: 1n << 1n, Execute: 1n << 2n } as const
 * }
 *
 * const p = new Permissions(['Read', 'Write'])
 * p.has('Read')            // true
 * p.without('Write')       // new instance without Write
 * p.symmetricDifference('Execute') // XOR
 * for (const f of p) { // iterate present flags }
 * ```
 */
export class FlaggedBitfield<T extends Flags>
    implements FlaggedBitfieldClass<T>
{
    /** The flags definition for this class. Override in subclasses. */
    static Flags: Flags = {}
    /** The default bitfield value used when constructing without an argument. */
    static DefaultBit: bigint = 0n

    /**
     * Normalize any accepted input into a masked `bigint`.
     *
     * - Arrays are OR-reduced
     * - `undefined` resolves to `0n`
     * - `boolean` is coerced to `0n` or `1n`
     * - Another `FlaggedBitfield` resolves to its internal bitfield
     * - Numbers/bigints are masked against {@link getMask}
     * - Strings are looked up as keys in {@link Flags}
     *
     * @typeParam T - Flags definition
     * @param bits - A bit or list of bits in any accepted format
     * @returns A normalized, masked bigint value
     * @example
     * ```ts
     * class F extends FlaggedBitfield<typeof F.Flags> {
     *   static Flags = { A: 1n << 0n, B: 1n << 1n } as const
     * }
     * F.normalize(['A', 'B'])    // 0b11n
     * F.normalize(1n)            // 0b01n
     * F.normalize(new F('A'))    // 0b01n
     * F.normalize('UnknownKey')  // 0n
     * ```
     */
    static normalize<T extends Flags>(bits: Bit<T>): bigint {
        if (Array.isArray(bits)) {
            return bits.reduce((a: bigint, b) => {
                return a | this.normalize(b)
            }, 0n)
        }

        if (typeof bits === 'undefined') {
            return 0n
        }

        if (typeof bits === 'boolean') bits = BigInt(bits)

        if (bits instanceof FlaggedBitfield) {
            return bits.bitfield
        }

        if (typeof bits === 'number' || typeof bits === 'bigint') {
            return BigInt(bits) & this.getMask()
        }

        if (typeof bits === 'string') {
            if (safeIn(this.Flags, bits))
                return BigInt(this.Flags[bits as keyof typeof this.Flags] ?? 0)
        }

        return 0n
    }

    /**
     * Return the highest bit value present in {@link Flags}.
     */
    static getMaxBit(): bigint {
        return Object.values(this.Flags).reduce((a: bigint, b) => {
            return a > BigInt(b) ? a : BigInt(b)
        }, 0n)
    }

    /**
     * Return the bit mask that includes all defined flag bits in {@link Flags}.
     */
    static getMask(): bigint {
        return Object.values(this.Flags).reduce((a: bigint, b) => {
            return a | BigInt(b)
        }, 0n)
    }

    #bitfield: bigint = (this.constructor as IFlaggedBitfield<T>).DefaultBit
    #con: IFlaggedBitfield<T>
    #validFlags: [keyof T, bigint][]
    #frozen: boolean = false

    /**
     * The internal bigint value representing the current bitfield.
     */
    get bitfield() {
        return this.#bitfield
    }

    /**
     * Create a new bitfield instance.
     *
     * @param bits - Initial bits to set. Defaults to {@link DefaultBit}.
     */
    constructor(bits: Bit<T> = this.#bitfield) {
        this.#con = this.constructor as IFlaggedBitfield<T>
        this.#bitfield = this.#con.resolve(bits)
        this.#validFlags = Reflect.ownKeys(this.#con.Flags)
            .map<[keyof T, bigint]>(k => [
                k as keyof T,
                BigInt(this.#con.Flags[k as keyof T]!),
            ])
            .sort((a, b) => (a[1] < b[1] ? -1 : 1))
    }

    /**
     * Set the provided bits on this instance. This method mutates.
     *
     * @param bit - Bits to set
     * @returns This instance (for chaining)
     * @example
     * ```ts
     * flags.add(['Read', 'Write']).remove('Execute')
     * ```
     */
    add(bit: Bit<T>): this {
        if (this.#frozen) return this
        this.#bitfield =
            (this.#bitfield | this.#con.resolve(bit)) & this.#con.getMask()
        return this
    }

    /**
     * Clear the provided bits on this instance. This method mutates.
     *
     * @param bit - Bits to clear
     * @returns This instance (for chaining)
     */
    remove(bit: Bit<T>): this {
        if (this.#frozen) return this
        this.#bitfield =
            this.#bitfield & ~this.#con.resolve(bit) & this.#con.getMask()
        return this
    }

    /**
     * Check whether any of the provided bits are set in this instance.
     *
     * @param bit - The bits to test
     * @returns true if any overlap exists, false otherwise
     */
    has(bit: Bit<T>): boolean {
        return (this.#bitfield & this.#con.resolve(bit)) !== 0n
    }

    /**
     * Return a new instance with the provided bits set (does not mutate this instance).
     *
     * @param bit - Bits to set
     * @returns A new bitfield instance
     * @example
     * ```ts
     * const q = new Permissions('Read').with('Write')
     * q.has(['Read', 'Write']) // true
     * ```
     */
    with(bit: Bit<T>): typeof this {
        return new this.#con(this.#bitfield).add(bit) as unknown as this
    }

    /**
     * Return a new instance with the provided bits cleared (does not mutate this instance).
     *
     * @param bit - Bits to clear
     * @returns A new bitfield instance
     * @example
     * ```ts
     * const q = new Permissions(['Read', 'Write']).without('Write')
     * q.has('Write') // false
     * ```
     */
    without(bit: Bit<T>): typeof this {
        return new this.#con(this.#bitfield).remove(bit) as unknown as this
    }

    /**
     * Return a new instance with all missing bits (within the mask) turned on.
     *
     * @returns A new bitfield instance that is the complement within the mask
     * @example
     * ```ts
     * // If mask is Read|Write|Execute and current is Read
     * new Permissions('Read').missing().toArray() // => ['Write', 'Execute']
     * ```
     */
    missing(): typeof this {
        return new this.#con(
            ~this.#bitfield & this.#con.getMask(),
        ) as unknown as this
    }

    /**
     * Invert this bitfield within the current mask (mutates).
     *
     * @returns This instance (for chaining)
     * @example
     * ```ts
     * const p = new Permissions('Read').invert() // becomes Write|Execute
     * ```
     */
    invert(): this {
        if (this.#frozen) return this
        this.#bitfield = this.missing().bitfield
        return this
    }

    /** Alias of {@link with}.
     * @example
     * ```ts
     * const u = new Permissions('Read').union('Write') // same as with('Write')
     * ```
     */
    union(bit: Bit<T>): typeof this {
        return this.with(bit)
    }

    /**
     * Return the intersection (AND) of this bitfield with the provided bits.
     *
     * @param bit - Bits to intersect with
     * @example
     * ```ts
     * const inter = new Permissions(['Read','Write']).intersection('Read')
     * inter.equals('Read') // true
     * ```
     */
    intersection(bit: Bit<T>): typeof this {
        return new this.#con(
            this.#bitfield & this.#con.resolve(bit),
        ) as unknown as this
    }

    /**
     * Return the difference (A & ~B) between this bitfield and the provided bits.
     *
     * @param bit - Bits to subtract from this set
     * @example
     * ```ts
     * const diff = new Permissions(['Read','Write']).difference('Read')
     * diff.equals('Write') // true
     * ```
     */
    difference(bit: Bit<T>): typeof this {
        return new this.#con(
            this.#bitfield & ~this.#con.resolve(bit),
        ) as unknown as this
    }

    /**
     * Return the symmetric difference (XOR) between this bitfield and the provided bits.
     *
     * @param bit - Bits to XOR with
     * @example
     * ```ts
     * const a = new Permissions('Read')
     * const b = a.symmetricDifference('Write') // => Read ^ Write
     * b.has(['Read','Write']) // true
     * ```
     */
    symmetricDifference(bit: Bit<T>): typeof this {
        return new this.#con(
            this.#bitfield ^ this.#con.resolve(bit),
        ) as unknown as this
    }

    /** Return the complement of this bitfield within the defined mask.
     * @example
     * ```ts
     * new Permissions('Read').complement().toArray() // => ['Write','Execute']
     * ```
     */
    complement(): typeof this {
        return this.missing()
    }

    /**
     * Strict equality check: whether this bitfield is exactly equal to the provided bits.
     *
     * @param bit - Bits to compare to
     * @example
     * ```ts
     * new Permissions(['Read','Write']).equals(['Read','Write']) // true
     * new Permissions(['Read','Write']).equals('Read')           // false
     * ```
     */
    equals(bit: Bit<T>): boolean {
        return this.#bitfield === this.#con.resolve(bit)
    }

    /**
     * Check whether there is any overlap with the provided bits (intersection != 0n).
     * @example
     * ```ts
     * new Permissions(['Read','Write']).any('Execute') // false
     * new Permissions(['Read','Write']).any('Read')    // true
     * ```
     */
    any(bit: Bit<T>): boolean {
        return this.intersection(bit).bitfield !== 0n
    }

    /** Return the flags definition backing this instance. */
    getFlags(): T {
        return this.#con.Flags
    }

    /**
     * Convert the internal bigint to a string.
     *
     * @param radix - Radix for conversion (2, 10, 16, ...)
     * @example
     * ```ts
     * new Permissions(['Read']).toString(2) // e.g., "1"
     * ```
     */
    toString(radix?: number): string {
        return this.#bitfield.toString(radix)
    }

    /** Serialize as a string (same as {@link toString}). */
    toJSON(): string {
        return this.#bitfield.toString()
    }

    /** Convert the internal bigint to a number (may truncate for very large values).
     * @example
     * ```ts
     * new Permissions(['Read']).toNumber() // e.g., 1
     * ```
     */
    toNumber(): number {
        return Number(this.#bitfield)
    }

    /** List all present flags as an array (iteration order is ascending by bit value).
     * @example
     * ```ts
     * new Permissions(['Read','Execute']).toArray() // => ['Read','Execute']
     * ```
     */
    toArray(): (keyof T)[] {
        return [...this]
    }

    /**
     * Convert to a plain object mapping each flag key to a boolean presence.
     * @example
     * ```ts
     * new Permissions(['Read']).toObject()
     * // => { Read: true, Write: false, Execute: false }
     * ```
     */
    toObject(): Record<keyof T, boolean> {
        const r: Partial<Record<keyof T, boolean>> = {}
        for (const k of Object.keys(this.#con.Flags)) {
            Object.assign(r, { [k]: this.has(k) })
        }
        return r as Record<keyof T, boolean>
    }

    /** Iterate over all present flags in ascending bit order.
     * @example
     * ```ts
     * for (const f of new Permissions(['Read','Write'])) {
     *   console.log(f)
     * }
     * ```
     */
    *[Symbol.iterator](): IterableIterator<keyof T> {
        for (const [flag, bit] of this.#validFlags) {
            if ((this.#bitfield & bit) !== 0n) yield flag
        }
    }

    /** Find the first present flag matching the predicate, if any.
     * @example
     * ```ts
     * new Permissions(['Read','Write']).find(f => f.startsWith('W')) // 'Write'
     * ```
     */
    find(predicate: (flag: keyof T) => boolean): keyof T | undefined {
        for (const f of this) {
            if (predicate(f)) return f
        }
        return undefined
    }

    /** Find the index within the internal ordered flags of the first match, or -1.
     * @example
     * ```ts
     * new Permissions(['Read','Write']).findIndex(f => f === 'Write') // >= 0
     * ```
     */
    findIndex(predicate: (flag: keyof T) => boolean): number {
        for (let i = 0; i < this.#validFlags.length; i++) {
            // eslint-disable-next-line security/detect-object-injection
            if (predicate(this.#validFlags[i]![0])) return i
        }
        return -1
    }

    /** Iterate all present flags, invoking `callback` for each.
     * @example
     * ```ts
     * new Permissions(['Read','Write']).forEach(f => console.log(f))
     * ```
     */
    forEach(callback: (flag: keyof T) => void): void {
        for (const f of this) {
            callback(f)
        }
    }

    /** Map over all present flags, returning an array with the mapped results.
     * @example
     * ```ts
     * new Permissions(['Read']).map(f => f.toLowerCase()) // ['read']
     * ```
     */
    map<R>(callback: (flag: keyof T) => R): R[] {
        const r: R[] = []
        for (const f of this) {
            r.push(callback(f))
        }
        return r
    }

    /** Return all known flag entries [key, value] sorted by bit value.
     * @example
     * ```ts
     * new Permissions().entries() // e.g., [['Read',1n], ['Write',2n], ...]
     * ```
     */
    entries(): [keyof T, bigint][] {
        return this.#validFlags
    }

    /** Return all known flag keys in ascending bit order.
     * @example
     * ```ts
     * new Permissions().keys() // ['Read','Write','Execute']
     * ```
     */
    keys(): (keyof T)[] {
        return this.#validFlags.map(([k]) => k)
    }

    /** Return all known flag values (bigints) in ascending bit order.
     * @example
     * ```ts
     * new Permissions().values() // [1n,2n,4n]
     * ```
     */
    values(): bigint[] {
        return this.#validFlags.map(([, v]) => v)
    }

    /**
     * Freeze this instance: subsequent mutating calls (`add`, `remove`, `invert`)
     * will no-op and return the same (frozen) instance. Also calls `Object.freeze`.
     * @example
     * ```ts
     * const frozen = new Permissions('Read').freeze()
     * frozen.add('Write') // no-op; still 'Read'
     * frozen.isFrozen()   // true
     * ```
     */
    freeze(): FrozenFlaggedBitfield<T> {
        this.#frozen = true
        Object.freeze(this)
        return this as unknown as FrozenFlaggedBitfield<T>
    }

    /** Whether this instance has been frozen. */
    isFrozen(): boolean {
        return this.#frozen
    }
}
