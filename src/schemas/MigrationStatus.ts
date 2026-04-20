import { Schema } from "effect";

export class MigrationStatus extends Schema.Class<MigrationStatus>("MigrationStatus")({
	id: Schema.Number,
	name: Schema.String,
	appliedAt: Schema.OptionFromUndefinedOr(Schema.DateTimeUtc),
}) {}
