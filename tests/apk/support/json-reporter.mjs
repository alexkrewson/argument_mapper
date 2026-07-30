// Newline-delimited JSON reporter for node:test.
//
// Node ships tap/spec/dot/junit/lcov but no json reporter, and TAP is awkward to
// parse back into structured results. report.mjs consumes this.

export default async function* jsonReporter(source) {
  for await (const event of source) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const d = event.data ?? {};
    const err = d.details?.error;
    yield `${JSON.stringify({
      type: event.type,
      data: {
        name: d.name,
        file: d.file,
        nesting: d.nesting,
        skip: Boolean(d.skip),
        details: {
          duration_ms: d.details?.duration_ms ?? 0,
          error: err ? { message: err.message ?? String(err), code: err.code ?? null } : null,
        },
      },
    })}\n`;
  }
}
