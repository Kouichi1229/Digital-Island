import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadLumiConfig } from "./lumi-config";

describe("loadLumiConfig", () => {
  it("uses the specified defaults when variables are absent", () => {
    assert.deepEqual(loadLumiConfig({}), {
      experimentalQueueCapacity: 1000,
      errorQueueCapacity: 200,
    });
  });

  it("accepts valid decimal values, including each boundary", () => {
    assert.deepEqual(
      loadLumiConfig({
        LUMI_EXPERIMENTAL_QUEUE_CAPACITY: "1",
        LUMI_ERROR_QUEUE_CAPACITY: "2000",
      }),
      { experimentalQueueCapacity: 1, errorQueueCapacity: 2000 },
    );
    assert.deepEqual(
      loadLumiConfig({
        LUMI_EXPERIMENTAL_QUEUE_CAPACITY: "10000",
        LUMI_ERROR_QUEUE_CAPACITY: "1",
      }),
      { experimentalQueueCapacity: 10000, errorQueueCapacity: 1 },
    );
  });

  it("validates the two variables independently", () => {
    assert.deepEqual(
      loadLumiConfig({ LUMI_EXPERIMENTAL_QUEUE_CAPACITY: "256" }),
      { experimentalQueueCapacity: 256, errorQueueCapacity: 200 },
    );
    assert.deepEqual(
      loadLumiConfig({ LUMI_ERROR_QUEUE_CAPACITY: "512" }),
      { experimentalQueueCapacity: 1000, errorQueueCapacity: 512 },
    );
  });

  const invalidValues = [
    "",
    "0",
    "-1",
    "+1",
    " 1",
    "1 ",
    "01",
    "1.0",
    "1e2",
    "abc",
    "10001",
  ];

  for (const value of invalidValues) {
    it(`rejects invalid strict-decimal value ${JSON.stringify(value)}`, () => {
      assert.throws(
        () =>
          loadLumiConfig({
            LUMI_EXPERIMENTAL_QUEUE_CAPACITY: value,
          }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.ok(
            error.message.includes("LUMI_EXPERIMENTAL_QUEUE_CAPACITY"),
          );
          assert.ok(error.message.includes("between 1 and 10000"));
          assert.ok(
            error.message.includes(`received ${JSON.stringify(value)}`),
          );
          return true;
        },
      );
    });
  }

  it("rejects an invalid error queue capacity with its own range", () => {
    assert.throws(
      () => loadLumiConfig({ LUMI_ERROR_QUEUE_CAPACITY: "2001" }),
      /LUMI_ERROR_QUEUE_CAPACITY.*between 1 and 2000.*2001/,
    );
  });
});
