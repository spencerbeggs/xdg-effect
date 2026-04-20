import { Schema } from "effect";

export class CacheEntry extends Schema.Class<CacheEntry>("CacheEntry")({
	key: Schema.String,
	value: Schema.Uint8ArrayFromSelf,
	contentType: Schema.String,
	tags: Schema.Array(Schema.String),
	created: Schema.DateTimeUtc,
	expiresAt: Schema.OptionFromUndefinedOr(Schema.DateTimeUtc),
	sizeBytes: Schema.Number,
}) {}
