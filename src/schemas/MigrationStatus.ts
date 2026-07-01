import { Schema } from "effect";

/**
 * The applied/pending status of a single {@link StateMigration}.
 *
 * @public
 */
export class MigrationStatus extends Schema.Class<MigrationStatus>("MigrationStatus")({
	id: Schema.Number,
	name: Schema.String,
	appliedAt: Schema.OptionFromUndefinedOr(Schema.DateTimeUtc),
}) {}
