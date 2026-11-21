/**
 * Quem roda a montagem no GitHub Actions entra sem senha (ADR 0022): o job pede ao GitHub um token
 * OIDC (um JWT assinado por ele, que vale alguns minutos) e o Worker confere a assinatura com as
 * chaves públicas do GitHub e as afirmações do token: o repositório (pelo número, que não muda com
 * renomeação), a main e o arquivo da montagem. Assim nenhum segredo fica guardado no GitHub, e um
 * fork, um pull request ou outro workflow do mesmo repositório não grava nada.
 */

export const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
/** o `audience` que o montador pede ao GitHub (scripts/montagem/montar.mjs) */
export const AUDIENCE = "proxinho-montagem";

/** De quem a montagem é aceita: o repositório (números do GitHub) e o arquivo do workflow. */
export type Trust = { repositoryId: string; ownerId: string; workflow: string };

type Jwk = JsonWebKey & { kid?: string };
export type JwksSource = () => Promise<Jwk[]>;

let cachedKeys: { keys: Jwk[]; at: number } | null = null;

/** As chaves públicas do GitHub, guardadas por uma hora. */
const githubKeys: JwksSource = async () => {
  if (cachedKeys && Date.now() - cachedKeys.at < 3600_000) return cachedKeys.keys;
  const res = await fetch(`${GITHUB_ISSUER}/.well-known/jwks`);
  if (!res.ok) throw new Error(`jwks: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  cachedKeys = { keys, at: Date.now() };
  return keys;
};

const fromBase64Url = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(
    s
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(s.length / 4) * 4, "="),
  );
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const jsonPart = (s: string): Record<string, unknown> => JSON.parse(new TextDecoder().decode(fromBase64Url(s)));

/** tokens já conferidos, até vencerem (o montador manda o mesmo a cada carta) */
const verified = new Map<string, number>();

/**
 * O token é do workflow da montagem, na main, do repositório de `trust`? Confere a assinatura
 * (RS256, chave do GitHub), o emissor, o destinatário, a validade e as afirmações do repositório.
 */
export async function trustedWorkflow(token: string, trust: Trust, keys: JwksSource = githubKeys, now = Date.now()): Promise<boolean> {
  const exp = verified.get(token);
  if (exp && exp * 1000 > now) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const header = jsonPart(parts[0]);
    const claims = jsonPart(parts[1]);
    if (header.alg !== "RS256") return false;
    const jwk = (await keys()).find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64Url(parts[2]), signed))) return false;
    const secs = now / 1000;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const ok =
      claims.iss === GITHUB_ISSUER &&
      aud.includes(AUDIENCE) &&
      typeof claims.exp === "number" &&
      claims.exp > secs &&
      (typeof claims.nbf !== "number" || claims.nbf <= secs + 60) &&
      String(claims.repository_id) === trust.repositoryId &&
      String(claims.repository_owner_id) === trust.ownerId &&
      claims.ref === "refs/heads/main" &&
      typeof claims.workflow_ref === "string" &&
      claims.workflow_ref.toLowerCase().startsWith(`${String(claims.repository).toLowerCase()}/${trust.workflow}@`) &&
      claims.runner_environment === "github-hosted";
    if (ok) {
      if (verified.size > 100) verified.clear();
      verified.set(token, claims.exp as number);
    }
    return ok;
  } catch {
    return false;
  }
}
