import { describe, expect, it } from "vitest";
import { resolveAnthropicAuth } from "./auth";

const federationEnv = {
  ANTHROPIC_FEDERATION_RULE_ID: "fdrl_1",
  ANTHROPIC_ORGANIZATION_ID: "org-1",
  ANTHROPIC_SERVICE_ACCOUNT_ID: "svac_1",
};

describe("resolveAnthropicAuth", () => {
  it("returns null with nothing configured, ignoring blank values", () => {
    expect(resolveAnthropicAuth({})).toBeNull();
    expect(resolveAnthropicAuth({ ANTHROPIC_API_KEY: "  " })).toBeNull();
  });

  it("prefers an API key over federation, like the SDK does", () => {
    expect(resolveAnthropicAuth({ ANTHROPIC_API_KEY: " sk-ant-x ", ...federationEnv })).toEqual({ mode: "api-key", apiKey: "sk-ant-x" });
  });

  it("uses federation when all three IDs are present", () => {
    expect(resolveAnthropicAuth(federationEnv)).toEqual({
      mode: "federation",
      federationRuleId: "fdrl_1",
      organizationId: "org-1",
      serviceAccountId: "svac_1",
      workspaceId: undefined,
      audience: "https://api.anthropic.com",
    });
    expect(resolveAnthropicAuth({ ...federationEnv, ANTHROPIC_WORKSPACE_ID: "wrkspc_1", ANTHROPIC_OIDC_AUDIENCE: "https://x" })).toMatchObject({
      workspaceId: "wrkspc_1",
      audience: "https://x",
    });
  });

  it("needs every federation ID, not just some", () => {
    expect(resolveAnthropicAuth({ ANTHROPIC_FEDERATION_RULE_ID: "fdrl_1", ANTHROPIC_ORGANIZATION_ID: "org-1" })).toBeNull();
  });
});
