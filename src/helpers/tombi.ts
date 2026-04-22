/**
 * Options for the `tombi()` annotation helper.
 *
 * @public
 */
export interface TombiOptions {
	/** Label for additionalProperties keys in completions. */
	readonly additionalKeyLabel?: string;
	/** Table key sorting strategy. */
	readonly tableKeysOrder?: "schema" | "ascending" | "descending" | "version-sort";
	/** Array element sorting strategy. */
	readonly arrayValuesOrder?: "ascending" | "descending" | "version-sort";
	/** Key field for sorting table array elements. */
	readonly arrayValuesOrderBy?: string;
	/** Additional string format validators to enable. */
	readonly stringFormats?: ReadonlyArray<string>;
	/** TOML version compliance (e.g. "v1.0.0" or "v1.1.0"). */
	readonly tomlVersion?: string;
	/** Escape hatch for undocumented or future x-tombi-* extensions. */
	readonly custom?: Record<string, unknown>;
}

const fieldMap: ReadonlyArray<readonly [keyof TombiOptions, string]> = [
	["additionalKeyLabel", "x-tombi-additional-key-label"],
	["tableKeysOrder", "x-tombi-table-keys-order"],
	["arrayValuesOrder", "x-tombi-array-values-order"],
	["arrayValuesOrderBy", "x-tombi-array-values-order-by"],
	["stringFormats", "x-tombi-string-formats"],
	["tomlVersion", "x-tombi-toml-version"],
];

/**
 * Builds a record of `x-tombi-*` annotation keys from typed options.
 *
 * @remarks
 * Pure function for use in Effect Schema `jsonSchema` annotations or
 * `SchemaEntry.annotations`. Compose with `taplo()` via spread.
 *
 * @public
 */
export const tombi = (options: TombiOptions): Record<string, unknown> => {
	const result: Record<string, unknown> = {};
	for (const [key, tombiKey] of fieldMap) {
		if (options[key] !== undefined) {
			result[tombiKey] = options[key];
		}
	}
	if (options.custom) {
		for (const [key, value] of Object.entries(options.custom)) {
			result[key] = value;
		}
	}
	return result;
};
