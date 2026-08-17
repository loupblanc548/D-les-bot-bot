/**
 * cloudApiToolkit.ts — Cloud & API utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import { execSync } from "child_process";
import https from "https";

function _fetchJson(url: string, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout, headers: { "User-Agent": "QuantBot/1.0" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// ─── AWS S3 bucket check ────────────────────────────────────────────────────
export async function awsS3BucketCheck(bucketName: string): Promise<string> {
  try {
    const url = `https://${bucketName}.s3.amazonaws.com`;
    const resp = await new Promise<{ status: number }>((resolve, reject) => {
      const r = https.get(url, { timeout: 10000 }, (res) =>
        resolve({ status: res.statusCode || 0 }),
      );
      r.on("error", reject);
      r.on("timeout", () => {
        r.destroy();
        reject(new Error("Timeout"));
      });
    });
    const isPublic = resp.status === 200;
    const isProtected = resp.status === 403;
    return JSON.stringify(
      {
        bucketName,
        url,
        httpStatus: resp.status,
        isPublic,
        isProtected,
        recommendation: isPublic
          ? "⚠️ Bucket is publicly accessible!"
          : "✅ Bucket is not publicly accessible",
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── AWS IAM audit ──────────────────────────────────────────────────────────
export function awsIamAudit(): string {
  try {
    const cmd = "aws iam list-users --output json 2>&1 | head -50";
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "AWS CLI not configured or no IAM users";
  } catch (err) {
    return `Error: ${(err as Error).message}. Ensure AWS CLI is configured.`;
  }
}

// ─── AWS security groups audit ──────────────────────────────────────────────
export function awsSecurityGroupsAudit(): string {
  try {
    const cmd = "aws ec2 describe-security-groups --output json 2>&1 | head -80";
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "AWS CLI not configured";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Azure AD enum ───────────────────────────────────────────────────────────
export function azureAdEnum(): string {
  return "Azure AD enumeration requires Azure CLI (az) with authenticated credentials. Run: az ad user list --output json";
}

// ─── GCP project enum ───────────────────────────────────────────────────────
export function gcpProjectEnum(): string {
  try {
    const cmd = "gcloud projects list --format=json 2>&1 | head -30";
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "GCP CLI not configured";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Cloud metadata check ───────────────────────────────────────────────────
export async function cloudMetadataCheck(): Promise<string> {
  const endpoints = [
    { name: "AWS", url: "http://169.254.169.254/latest/meta-data/" },
    { name: "GCP", url: "http://metadata.google.internal/computeMetadata/v1/" },
    { name: "Azure", url: "http://169.254.169.254/metadata/instance?api-version=2021-02-01" },
  ];
  const results: { cloud: string; accessible: boolean }[] = [];
  for (const ep of endpoints) {
    try {
      const http = await import("http");
      const resp = await new Promise<{ status: number }>((resolve, reject) => {
        const r = http.get(
          ep.url,
          { timeout: 3000, headers: ep.name === "GCP" ? { "Metadata-Flavor": "Google" } : {} },
          (res) => resolve({ status: res.statusCode || 0 }),
        );
        r.on("error", reject);
        r.on("timeout", () => {
          r.destroy();
          reject(new Error("Timeout"));
        });
      });
      results.push({ cloud: ep.name, accessible: resp.status === 200 });
    } catch {
      results.push({ cloud: ep.name, accessible: false });
    }
  }
  return JSON.stringify(results, null, 2);
}

// ─── Terraform validate ─────────────────────────────────────────────────────
export function terraformValidate(dirPath: string): string {
  try {
    const cmd = `cd ${dirPath} && terraform validate -json 2>&1`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf8" }).trim();
    return output || "Validation passed";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Terraform plan diff ────────────────────────────────────────────────────
export function terraformPlanDiff(dirPath: string): string {
  try {
    const cmd = `cd ${dirPath} && terraform plan -no-color 2>&1 | head -60`;
    const output = execSync(cmd, { timeout: 60_000, encoding: "utf8" }).trim();
    return output || "No changes";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Kubernetes manifest validate ───────────────────────────────────────────
export function kubernetesManifestValidate(filePath: string): string {
  try {
    const cmd = `kubectl apply --dry-run=client -f ${filePath} 2>&1`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "Manifest is valid";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Docker compose validate ────────────────────────────────────────────────
export function dockerComposeValidate(filePath: string): string {
  try {
    const cmd = `docker-compose -f ${filePath || "docker-compose.yml"} config 2>&1 | head -30`;
    const output = execSync(cmd, { timeout: 15_000, encoding: "utf8" }).trim();
    return output || "docker-compose.yml is valid";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── API schema diff ────────────────────────────────────────────────────────
export function apiSchemaDiff(schema1: string, schema2: string): string {
  try {
    const s1 = JSON.parse(schema1);
    const s2 = JSON.parse(schema2);
    const paths1 = new Set(Object.keys(s1.paths || {}));
    const paths2 = new Set(Object.keys(s2.paths || {}));
    const added = [...paths2].filter((p) => !paths1.has(p));
    const removed = [...paths1].filter((p) => !paths2.has(p));
    return JSON.stringify(
      {
        addedEndpoints: added,
        removedEndpoints: removed,
        totalV1: paths1.size,
        totalV2: paths2.size,
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── GraphQL introspection check ────────────────────────────────────────────
export async function graphqlIntrospectionCheck(url: string): Promise<string> {
  try {
    const query = '{"query":"{ __schema { types { name } } }"}';
    const resp = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": query.length },
      };
      const req = https.request(options, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: d.slice(0, 200) }));
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
      req.write(query);
      req.end();
    });
    const introspectionEnabled = resp.status === 200 && resp.body.includes("__schema");
    return JSON.stringify(
      {
        url,
        introspectionEnabled,
        httpStatus: resp.status,
        recommendation: introspectionEnabled
          ? "⚠️ Introspection is enabled — disable in production!"
          : "✅ Introspection is disabled",
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── API rate limit discover ────────────────────────────────────────────────
export async function apiRateLimitDiscover(url: string): Promise<string> {
  try {
    const resp = await new Promise<{
      status: number;
      headers: Record<string, string | string[] | undefined>;
    }>((resolve, reject) => {
      const r = https.get(url, { timeout: 5000 }, (res) => {
        resolve({ status: res.statusCode || 0, headers: res.headers as any });
      });
      r.on("error", reject);
      r.on("timeout", () => {
        r.destroy();
        reject(new Error("Timeout"));
      });
    });
    const rateLimitHeaders = [
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-reset",
      "retry-after",
    ];
    const found: Record<string, string> = {};
    for (const h of rateLimitHeaders) {
      const val = resp.headers[h];
      if (val) found[h] = Array.isArray(val) ? val[0] : val;
    }
    return JSON.stringify({ url, rateLimitHeaders: found, httpStatus: resp.status }, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Webhook signature verify ───────────────────────────────────────────────
export async function webhookSignatureVerify(
  payload: string,
  signature: string,
  secret: string,
  algorithm: string,
): Promise<string> {
  try {
    const crypto = await import("crypto");
    const algo = algorithm || "sha256";
    const expected = crypto.createHmac(algo, secret).update(payload).digest("hex");
    const match = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    return JSON.stringify(
      { match, expected: expected.slice(0, 20) + "...", provided: signature.slice(0, 20) + "..." },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── OAuth flow test ────────────────────────────────────────────────────────
export function oauthFlowTest(
  authorizationUrl: string,
  tokenUrl: string,
  clientId: string,
  scope: string,
): string {
  return `OAuth2 Test Plan:\n\n1. Authorization URL: ${authorizationUrl}?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scope || "")}&redirect_uri=CALLBACK\n2. Token URL: ${tokenUrl}\n3. Client ID: ${clientId}\n\nUse http_request tool to test each step.`;
}
