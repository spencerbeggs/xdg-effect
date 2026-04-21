import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import type { Scope } from "effect";
import { Effect, Layer } from "effect";
import type { JsonSchemaExporter } from "../services/JsonSchemaExporter.js";
// biome-ignore lint/suspicious/noImportCycles: Test layer intentionally co-locates with Live layer in the same cycle
import { JsonSchemaExporterLiveImpl } from "./JsonSchemaExporterLive.js";

export const JsonSchemaExporterTestImpl: Layer.Layer<JsonSchemaExporter, never, Scope.Scope> = Layer.unwrapScoped(
	Effect.gen(function* () {
		yield* Effect.acquireRelease(
			Effect.sync(() => mkdtempSync(join(tmpdir(), "xdg-jsonschema-test-"))),
			(dir) => Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
		);
		return JsonSchemaExporterLiveImpl().pipe(Layer.provide(NodeFileSystem.layer));
	}),
);
