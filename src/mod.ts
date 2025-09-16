export type Flags = Record<string, bigint | number>

type IFlaggedBitfield<T extends Flags> = {
    new (bits?: Bit<T>): FlaggedBitfieldClass<T>
    Flags: T
    DefaultBit: bigint
    resolve<T extends Flags>(bits: Bit<T>): bigint
    getMaxBit(): bigint
    getMask(): bigint
}

interface FlaggedBitfieldClass<T extends Flags>
    extends FrozenFlaggedBitfield<T> {
    freeze(): FrozenFlaggedBitfield<T>
    add(bit: Bit<T>): this
    remove(bit: Bit<T>): this
    invert(): this
}
interface FrozenFlaggedBitfield<T extends Flags> {
    readonly bitfield: bigint

    has(bit: Bit<T>): boolean
    with(bit: Bit<T>): this
    without(bit: Bit<T>): this
    missing(): this
    union(bit: Bit<T>): this
    intersection(bit: Bit<T>): this
    difference(bit: Bit<T>): this
    simetricDifference(bit: Bit<T>): this
    complement(): this
    isFrozen(): boolean
    toArray(): (keyof T)[]
    toJSON(): string
    toString(): string
    [Symbol.iterator](): IterableIterator<keyof T>
}

type FlatBit<T extends Flags> =
    | number
    | bigint
    | keyof T
    | (string & {})
    | FlaggedBitfieldClass<T>
type Bit<T extends Flags> = FlatBit<T> | FlatBit<T>[]

function safeIn(ob: object, key: string | number | symbol) {
    return Object.prototype.hasOwnProperty.call(ob, key)
}

export class FlaggedBitfield<T extends Flags>
    implements FlaggedBitfieldClass<T>
{
    static Flags: Flags = {}
    static DefaultBit: bigint = 0n

    static resolve<T extends Flags>(bits: Bit<T>): bigint {
        if (Array.isArray(bits)) {
            return bits.reduce((a: bigint, b) => {
                return a | this.resolve(b)
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

    static getMaxBit(): bigint {
        return Object.values(this.Flags).reduce((a: bigint, b) => {
            return a > BigInt(b) ? a : BigInt(b)
        }, 0n)
    }

    static getMask(): bigint {
        return Object.values(this.Flags).reduce((a: bigint, b) => {
            return a | BigInt(b)
        }, 0n)
    }

    #bitfield: bigint = (this.constructor as IFlaggedBitfield<T>).DefaultBit
    #con: IFlaggedBitfield<T>
    #validFlags: [keyof T, bigint][]
    #frozen: boolean = false

    get bitfield() {
        return this.#bitfield
    }

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

    add(bit: Bit<T>): this {
        if (this.#frozen) return this
        this.#bitfield =
            (this.#bitfield | this.#con.resolve(bit)) & this.#con.getMask()
        return this
    }

    remove(bit: Bit<T>): this {
        if (this.#frozen) return this
        this.#bitfield =
            this.#bitfield & ~this.#con.resolve(bit) & this.#con.getMask()
        return this
    }

    has(bit: Bit<T>): boolean {
        return (this.#bitfield & this.#con.resolve(bit)) !== 0n
    }

    with(bit: Bit<T>): typeof this {
        return new this.#con(this.#bitfield).add(bit) as unknown as this
    }

    without(bit: Bit<T>): typeof this {
        return new this.#con(this.#bitfield).remove(bit) as unknown as this
    }

    missing(): typeof this {
        return new this.#con(
            ~this.#bitfield & this.#con.getMask(),
        ) as unknown as this
    }

    invert(): this {
        if (this.#frozen) return this
        this.#bitfield = this.missing().bitfield
        return this
    }

    union(bit: Bit<T>): typeof this {
        return this.with(bit)
    }

    intersection(bit: Bit<T>): typeof this {
        return new this.#con(
            this.#bitfield & this.#con.resolve(bit),
        ) as unknown as this
    }

    difference(bit: Bit<T>): typeof this {
        return new this.#con(
            this.#bitfield & ~this.#con.resolve(bit),
        ) as unknown as this
    }

    simetricDifference(bit: Bit<T>): typeof this {
        return new this.#con(
            this.#bitfield ^ this.#con.resolve(bit),
        ) as unknown as this
    }

    complement(): typeof this {
        return this.missing()
    }

    equals(bit: Bit<T>): boolean {
        return this.#bitfield === this.#con.resolve(bit)
    }

    any(bit: Bit<T>): boolean {
        return this.intersection(bit).bitfield !== 0n
    }

    getFlags(): T {
        return this.#con.Flags
    }

    toString(radix?: number): string {
        return this.#bitfield.toString(radix)
    }

    toJSON(): string {
        return this.#bitfield.toString()
    }

    toNumber(): number {
        return Number(this.#bitfield)
    }

    toArray(): (keyof T)[] {
        return [...this]
    }

    toObject<R = Record<keyof T, boolean>>(): R {
        const r: Partial<R> = {}
        for (const k of Object.keys(this.#con.Flags)) {
            Object.assign(r, { [k]: this.has(k) })
        }
        return r as R
    }

    *[Symbol.iterator](): IterableIterator<keyof T> {
        for (const [flag, bit] of this.#validFlags) {
            if ((this.#bitfield & bit) !== 0n) yield flag
        }
    }

    find(predicate: (flag: keyof T) => boolean): keyof T | undefined {
        for (const f of this) {
            if (predicate(f)) return f
        }
        return undefined
    }

    findIndex(predicate: (flag: keyof T) => boolean): number {
        for (let i = 0; i < this.#validFlags.length; i++) {
            // eslint-disable-next-line security/detect-object-injection
            if (predicate(this.#validFlags[i]![0])) return i
        }
        return -1
    }

    forEach(callback: (flag: keyof T) => void): void {
        for (const f of this) {
            callback(f)
        }
    }

    map<R>(callback: (flag: keyof T) => R): R[] {
        const r: R[] = []
        for (const f of this) {
            r.push(callback(f))
        }
        return r
    }

    entries(): [keyof T, bigint][] {
        return this.#validFlags
    }

    keys(): (keyof T)[] {
        return this.#validFlags.map(([k]) => k)
    }

    values(): bigint[] {
        return this.#validFlags.map(([, v]) => v)
    }

    freeze(): FrozenFlaggedBitfield<T> {
        this.#frozen = true
        Object.freeze(this)
        return this as unknown as FrozenFlaggedBitfield<T>
    }

    isFrozen(): boolean {
        return this.#frozen
    }
}
