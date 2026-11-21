import { beforeAll, describe, expect, it } from "vitest";
import { AUDIENCE, GITHUB_ISSUER, trustedWorkflow, type Trust } from "../../worker/github";

const TRUST: Trust = { repositoryId: "1460874607", ownerId: "46091881", workflow: ".github/workflows/montagem.yml" };
const NOW = Date.UTC(2026, 10, 21, 5, 0, 0);

let keys: CryptoKeyPair;
let jwk: JsonWebKey & { kid: string };

const b64url = (data: Uint8Array | string) =>
  Buffer.from(typeof data === "string" ? new TextEncoder().encode(data) : data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Um token como o do GitHub Actions, assinado com a chave de teste. */
async function token(over: Record<string, unknown> = {}, kid = "k1", key = keys.privateKey) {
  const secs = Math.floor(NOW / 1000);
  const claims = {
    iss: GITHUB_ISSUER,
    aud: AUDIENCE,
    exp: secs + 300,
    nbf: secs - 5,
    iat: secs - 5,
    repository: "johnlaff/Proxinho",
    repository_id: "1460874607",
    repository_owner_id: "46091881",
    ref: "refs/heads/main",
    workflow_ref: "johnlaff/Proxinho/.github/workflows/montagem.yml@refs/heads/main",
    runner_environment: "github-hosted",
    event_name: "workflow_run",
    ...over,
  };
  const head = `${b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head)));
  return `${head}.${b64url(sig)}`;
}

const source = async () => [jwk];

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  jwk = { ...((await crypto.subtle.exportKey("jwk", keys.publicKey)) as JsonWebKey), kid: "k1" };
});

describe("token OIDC do workflow da montagem (GitHub Actions)", () => {
  it("aceita o workflow da montagem, na main, do repositório certo", async () => {
    expect(await trustedWorkflow(await token(), TRUST, source, NOW)).toBe(true);
    // o nome do repositório pode mudar de caixa; o número é o que vale
    expect(
      await trustedWorkflow(
        await token({ workflow_ref: "JohnLaff/proxinho/.github/workflows/montagem.yml@refs/heads/main", repository: "JohnLaff/proxinho" }),
        TRUST,
        source,
        NOW,
      ),
    ).toBe(true);
  });

  it("recusa fork, outro repositório, outra branch, outro workflow e máquina própria", async () => {
    const no = async (over: Record<string, unknown>) => expect(await trustedWorkflow(await token(over), TRUST, source, NOW)).toBe(false);
    await no({ repository_id: "999" });
    await no({ repository_owner_id: "1" });
    await no({ ref: "refs/heads/claude/qualquer" });
    await no({ ref: "refs/pull/3/merge" });
    await no({ workflow_ref: "johnlaff/Proxinho/.github/workflows/ci.yml@refs/heads/main" });
    await no({ workflow_ref: "johnlaff/Proxinho/.github/workflows/montagem.yml.evil@refs/heads/main" });
    await no({ runner_environment: "self-hosted" });
  });

  it("recusa token vencido, de outro emissor, para outro destinatário ou com assinatura errada", async () => {
    const no = async (t: string) => expect(await trustedWorkflow(t, TRUST, source, NOW)).toBe(false);
    await no(await token({ exp: Math.floor(NOW / 1000) - 1 }));
    await no(await token({ iss: "https://example.com" }));
    await no(await token({ aud: "https://github.com/johnlaff" }));
    await no(await token({}, "outra-chave"));
    const other = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    await no(await token({ jti: "x" }, "k1", other.privateKey));
    const [h, p] = (await token({ jti: "y" })).split(".");
    await no(`${h}.${p}.`);
    await no("não.é.jwt");
    await no(`${b64url(JSON.stringify({ alg: "none", kid: "k1" }))}.${p}.`);
  });
});
