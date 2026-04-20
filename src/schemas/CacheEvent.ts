import { Schema } from "effect";

export const CacheEventPayload = Schema.Union(
	Schema.TaggedStruct("Hit", { key: Schema.String }),
	Schema.TaggedStruct("Miss", { key: Schema.String }),
	Schema.TaggedStruct("Set", {
		key: Schema.String,
		sizeBytes: Schema.Number,
		tags: Schema.Array(Schema.String),
	}),
	Schema.TaggedStruct("Invalidated", { key: Schema.String }),
	Schema.TaggedStruct("InvalidatedByTag", {
		tag: Schema.String,
		count: Schema.Number,
	}),
	Schema.TaggedStruct("InvalidatedAll", { count: Schema.Number }),
	Schema.TaggedStruct("Pruned", { count: Schema.Number }),
	Schema.TaggedStruct("Expired", { key: Schema.String }),
);

export class CacheEvent extends Schema.Class<CacheEvent>("CacheEvent")({
	timestamp: Schema.DateTimeUtc,
	event: CacheEventPayload,
}) {}
