import { describe, expect, it } from "vitest";

import { extractAiAccountingActionIds } from "@/lib/aiAccountingActionIds";

describe("extractAiAccountingActionIds", () => {
  it("extracts action ids from approve paths and evidence tokens", () => {
    const actionId = "11111111-2222-4333-8444-555555555555";
    const ids = extractAiAccountingActionIds(
      `Approve through POST /api/v1/actions/${actionId}/approve.`,
      `action_id:${actionId}`,
    );
    expect(ids).toEqual([actionId]);
  });
});
