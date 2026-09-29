import { describe, expect, it } from "vitest";

import { JevAttributionChecker } from "../src/jev-attribution-checker.js";
import type { SystemOneClient } from "../src/jev-checker.js";

describe("Jev attribution checker", () => {
  it("uses the pinned binary rubric and the authors' reference delimiter", async () => {
    let request: unknown;
    let requestOptions: unknown;
    const client: SystemOneClient = {
      systemOne: async (receivedRequest, receivedOptions) => {
        request = receivedRequest;
        requestOptions = receivedOptions;
        return {
          model: "jev-1.13.0",
          answers: {
            attribution: {
              type: "choice",
              choice: "attributable",
              probabilities: { attributable: 0.9, not_attributable: 0.1 },
              confidence: 0.8,
            },
          },
          usage: { input_tokens: 20, output_tokens: 4 },
          providerRequestId: "request-1",
        };
      },
    };
    const checker = new JevAttributionChecker(client, {
      model: "jev-1.13.0",
      rubricVersion: "attributionbench-binary-v1",
      timeoutMs: 1234,
      maxRetries: 0,
      now: () => new Date("2026-09-29T00:00:00.000Z"),
    });

    const result = await checker.check({
      id: "case-1",
      claim: "The claim.",
      references: ["First reference.", "Second reference."],
      rubricVersion: "attributionbench-binary-v1",
    });

    expect(request).toMatchObject({
      model: "jev-1.13.0",
      state: {
        claim: "The claim.",
        references: "First reference.\n\n\nSecond reference.",
      },
      questions: {
        attribution: {
          type: "choice",
          criteria: {
            attributable: expect.any(String),
            not_attributable: expect.any(String),
          },
        },
      },
    });
    expect((request as { state: Record<string, unknown> }).state).not.toHaveProperty("question");
    expect(requestOptions).toEqual({ timeout: 1234, retry: { maxRetries: 0 } });
    expect(result).toMatchObject({
      label: "attributable",
      requestedModel: "jev-1.13.0",
      resolvedModel: "jev-1.13.0",
      inputTokens: 20,
      providerRequestId: "request-1",
    });
  });

  it("rejects malformed provider distributions", async () => {
    const checker = new JevAttributionChecker(
      {
        systemOne: async () => ({
          model: "jev-1.13.0",
          answers: {
            attribution: {
              type: "choice",
              choice: "not_attributable",
              probabilities: { attributable: 0.7, not_attributable: 0.7 },
              confidence: 0.4,
            },
          },
          usage: {},
        }),
      },
      { model: "jev-1.13.0", rubricVersion: "attributionbench-binary-v1" },
    );

    await expect(
      checker.check({
        id: "case-1",
        claim: "Claim",
        references: ["Reference"],
        rubricVersion: "attributionbench-binary-v1",
      }),
    ).rejects.toThrow(/sum to 1/u);
  });
});
