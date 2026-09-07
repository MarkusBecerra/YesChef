/**
 * How the app authenticates to the Claude API. Mirrors the SDK's own precedence:
 * an API key always wins, otherwise Workload Identity Federation when its IDs are set.
 * Federation needs no secret at all: the host (Vercel) signs a short-lived identity
 * token which the SDK swaps for a short-lived Anthropic token at request time.
 */
export type AnthropicAuth =
  | { mode: "api-key"; apiKey: string }
  | {
      mode: "federation";
      federationRuleId: string;
      organizationId: string;
      serviceAccountId: string;
      workspaceId: string | undefined;
      /** The `aud` the federation rule expects; Vercel mints the identity token for it. */
      audience: string;
    };

export const DEFAULT_OIDC_AUDIENCE = "https://api.anthropic.com";

type Env = Record<string, string | undefined>;

const read = (env: Env, key: string) => env[key]?.trim() || undefined;

export function resolveAnthropicAuth(env: Env = process.env): AnthropicAuth | null {
  const apiKey = read(env, "ANTHROPIC_API_KEY");
  if (apiKey) return { mode: "api-key", apiKey };

  const federationRuleId = read(env, "ANTHROPIC_FEDERATION_RULE_ID");
  const organizationId = read(env, "ANTHROPIC_ORGANIZATION_ID");
  const serviceAccountId = read(env, "ANTHROPIC_SERVICE_ACCOUNT_ID");
  if (federationRuleId && organizationId && serviceAccountId) {
    return {
      mode: "federation",
      federationRuleId,
      organizationId,
      serviceAccountId,
      workspaceId: read(env, "ANTHROPIC_WORKSPACE_ID"),
      audience: read(env, "ANTHROPIC_OIDC_AUDIENCE") ?? DEFAULT_OIDC_AUDIENCE,
    };
  }
  return null;
}
