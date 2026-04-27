/**
 * Core types for the signalk-to-nmea0183 plugin.
 *
 * `SignalKApp` extends the public `ServerAPI` from `@signalk/server-api`
 * with the `emit` method the plugin uses to publish NMEA0183 sentences
 * on the host's event bus. `emit` is part of the `EventEmitter` the
 * server inherits from but is not modelled in `@signalk/server-api`.
 *
 * `SentenceEncoder` is the shape every module in src/sentences/ returns.
 * Keys are Signal K paths; `f` is invoked with the latest value for each
 * path (in the same order as `keys`) and must return either an NMEA
 * sentence string or `undefined` to skip emission.
 *
 * `defaults[i]` is the seed used when the stream for `keys[i]` has not
 * emitted yet. Indexes without defaults remain non-property streams and
 * must emit at least once before the combined stream fires.
 */
import type { EventStream, Property } from 'baconjs'
import type { Plugin, ServerAPI } from '@signalk/server-api'

export type { StreamBundle } from '@signalk/server-api'

/** @internal */
export type AnyStream<T = unknown> = EventStream<T> | Property<T>

/**
 * Extends the public `ServerAPI` with the EventEmitter `emit` method
 * the plugin uses to publish NMEA0183 sentences on the host's event
 * bus. The server is an EventEmitter at runtime but `emit` is not part
 * of the typed surface in `@signalk/server-api`.
 */
export interface SignalKApp extends ServerAPI {
  emit(event: string, value: unknown): void
}

/**
 * A sentence encoder. Generic parameter `A` ties the arity of `f` to
 * the length of `keys` / `defaults` for encoders that opt in:
 *
 *   const enc: SentenceEncoder<[number, number, string]> = {
 *     keys: ['a', 'b', 'c'],
 *     f: (a, b, c) => ...
 *   }
 *
 * rejects a `keys` array of the wrong length or an `f` with a mismatched
 * signature at the type level. The default `readonly any[]` preserves
 * the loose shape the registry uses to iterate all encoders uniformly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SentenceEncoder<
  A extends readonly unknown[] = readonly any[]
> {
  sentence?: string
  title: string
  keys: { readonly [I in keyof A]: string }
  defaults?: { readonly [I in keyof A]?: A[I] }
  optionKey?: string
  f: (...args: A) => string | undefined
}

/** @internal */
export type SentenceEncoderFactory = (
  app: SignalKApp,
  plugin?: SignalKPlugin
) => SentenceEncoder

// Exposed because `SignalKPlugin.schema` references these; they would
// otherwise be stripped by `stripInternal` and leave a broken .d.ts.
export interface SignalKPluginSchemaProperty {
  title: string
  type: string
  default?: unknown
}

export interface SignalKPluginSchema {
  type: string
  title: string
  description: string
  properties: Record<string, SignalKPluginSchemaProperty>
}

/**
 * Shape of the plugin object returned to the signalk-server host.
 * Consumers normally don't construct this directly — they call the
 * factory exported by the package entry.
 */
export interface SignalKPlugin extends Plugin {
  schema: SignalKPluginSchema
  sentences: Record<string, SentenceEncoder>
  unsubscribes: Array<() => void>
}
