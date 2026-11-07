// ตัวห่อ Amazon Cognito (AWS SDK v3) — โค้ดชุดเดียวกันใช้ทั้ง AWS จริงและตัวจำลอง local (cognito-local)
// ต่างกันที่ COGNITO_ENDPOINT เท่านั้น: ว่าง = Cognito จริงของ AWS, มีค่า = ตัวจำลอง
import {
  CognitoIdentityProviderClient, ConfirmForgotPasswordCommand, ConfirmSignUpCommand, CreateUserPoolClientCommand, CreateUserPoolCommand,
  ForgotPasswordCommand, GetUserCommand, InitiateAuthCommand, ListUserPoolClientsCommand, ListUserPoolsCommand,
  ResendConfirmationCodeCommand, RevokeTokenCommand, SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";

const region = process.env.AWS_REGION || "ap-southeast-1";
const endpoint = process.env.COGNITO_ENDPOINT?.replace(/\/$/, "") || undefined;
export const isLocal = !!endpoint;
// operation ฝั่งผู้ใช้ (SignUp/InitiateAuth/GetUser/...) ไม่ต้องเซ็นด้วย IAM จึงไม่ต้องมี AWS credentials ใน production
// ส่วน admin API (ListUserPools/CreateUserPool ที่ใช้สร้าง pool ในตัวจำลอง) ต้องมี credentials → ใส่ค่าปลอมเฉพาะตอน local
const client = new CognitoIdentityProviderClient({ region, endpoint, ...(endpoint && { credentials: { accessKeyId: "local", secretAccessKey: "local" } }) });

export class AuthError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

type Cfg = { poolId: string; clientId: string; issuer: string; jwks: ReturnType<typeof createRemoteJWKSet> };
let cfgPromise: Promise<Cfg> | null = null;

async function resolve(): Promise<Cfg> {
  let poolId = process.env.COGNITO_USER_POOL_ID || "", clientId = process.env.COGNITO_CLIENT_ID || "";
  if (!poolId || !clientId) {
    if (!isLocal) throw new Error("COGNITO_USER_POOL_ID และ COGNITO_CLIENT_ID ต้องตั้งค่า (หรือตั้ง COGNITO_ENDPOINT เพื่อใช้ตัวจำลอง local)");
    ({ poolId, clientId } = await ensureLocalPool());
  }
  // issuer: AWS จริง = cognito-idp.<region>.amazonaws.com/<pool>; ตัวจำลอง = <IssuerDomain ที่ตั้งใน config ของมัน>/<pool> (= endpoint ที่ใช้เรียก)
  const issuer = process.env.COGNITO_ISSUER || (isLocal ? `${endpoint}/${poolId}` : `https://cognito-idp.${region}.amazonaws.com/${poolId}`);
  return { poolId, clientId, issuer, jwks: createRemoteJWKSet(new URL(`${isLocal ? endpoint + "/" + poolId : issuer}/.well-known/jwks.json`)) };
}
export const config = () => (cfgPromise ??= resolve().catch((e) => { cfgPromise = null; throw e; }));

/** local เท่านั้น: หา/สร้าง user pool + app client ในตัวจำลองให้เอง (idempotent) */
async function ensureLocalPool() {
  const NAME = "moviebuddy";
  const pools = await client.send(new ListUserPoolsCommand({ MaxResults: 60 }));
  let poolId = pools.UserPools?.find((p) => p.Name === NAME)?.Id;
  if (!poolId) {
    const r = await client.send(new CreateUserPoolCommand({
      PoolName: NAME, UsernameAttributes: ["phone_number"], AutoVerifiedAttributes: ["phone_number"],
      Policies: { PasswordPolicy: { MinimumLength: 8, RequireNumbers: true, RequireLowercase: false, RequireUppercase: false, RequireSymbols: false } },
    }));
    poolId = r.UserPool!.Id!;
  }
  const clients = await client.send(new ListUserPoolClientsCommand({ UserPoolId: poolId, MaxResults: 60 }));
  let clientId = clients.UserPoolClients?.find((c) => c.ClientName === "web")?.ClientId;
  if (!clientId) {
    const r = await client.send(new CreateUserPoolClientCommand({
      UserPoolId: poolId, ClientName: "web", GenerateSecret: false, ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    }));
    clientId = r.UserPoolClient!.ClientId!;
  }
  console.log(`[auth] ใช้ Cognito จำลอง ${endpoint} pool=${poolId} client=${clientId}`);
  return { poolId, clientId };
}

// แปลง error ของ Cognito เป็นข้อความไทย (ไม่บอกว่าเบอร์นี้มีบัญชีหรือไม่ตอนล็อกอิน/ลืมรหัส)
type Ctx = "signup" | "confirm" | "login" | "forgot" | "reset" | "refresh" | "other";
function fail(e: any, ctx: Ctx): never {
  if (e instanceof AuthError) throw e;
  const n = e?.name as string;
  if (n === "UsernameExistsException") throw new AuthError(409, "เบอร์นี้สมัครไว้แล้ว — เข้าสู่ระบบ หรือกดยืนยันรหัสที่ส่งไปทาง SMS", { exists: true });
  if (ctx === "forgot" && n === "UserNotFoundException") throw new AuthError(404, "ไม่พบบัญชี");
  if (n === "UserNotConfirmedException") throw new AuthError(403, "เบอร์นี้ยังไม่ได้ยืนยันรหัส SMS", { needsConfirm: true });
  if (n === "CodeMismatchException" || n === "ExpiredCodeException") throw new AuthError(400, "รหัสไม่ถูกต้องหรือหมดอายุ");
  if (n === "InvalidPasswordException" && ctx !== "login") throw new AuthError(400, "รหัสผ่านไม่ตรงตามเงื่อนไข (อย่างน้อย 8 ตัวอักษร และมีตัวเลข)");
  if (ctx === "login" && ["NotAuthorizedException", "UserNotFoundException", "InvalidPasswordException"].includes(n)) throw new AuthError(401, "เบอร์หรือรหัสผ่านไม่ถูกต้อง");
  if (ctx === "refresh" && ["NotAuthorizedException", "UserNotFoundException"].includes(n)) throw new AuthError(401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  if (["TooManyRequestsException", "LimitExceededException", "TooManyFailedAttemptsException"].includes(n)) throw new AuthError(429, "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่");
  if (n === "InvalidParameterException") throw new AuthError(400, "ข้อมูลไม่ถูกต้อง");
  if (n === "CodeDeliveryFailureException") throw new AuthError(502, "ส่ง SMS ไม่สำเร็จ ลองใหม่อีกครั้ง");
  if (n === "Unsupported") throw new AuthError(501, "ฟีเจอร์นี้ตัวจำลอง Cognito (local) ยังไม่รองรับ — ใช้ได้บน Cognito จริง");
  console.error(`[auth] cognito ${ctx} failed:`, n, e?.message);
  throw new AuthError(502, "ระบบยืนยันตัวตนไม่พร้อมใช้งาน ลองใหม่อีกครั้ง");
}
async function run<T>(ctx: Ctx, fn: (c: Cfg) => Promise<T>): Promise<T> {
  try { return await fn(await config()); } catch (e) { return fail(e, ctx); }
}

export const signUp = (phone: string, password: string, name: string) => run("signup", async (c) => {
  await client.send(new SignUpCommand({
    ClientId: c.clientId, Username: phone, Password: password,
    UserAttributes: [{ Name: "phone_number", Value: phone }, { Name: "name", Value: name }],
  }));
});
export const confirmSignUp = (phone: string, code: string) => run("confirm", async (c) => { await client.send(new ConfirmSignUpCommand({ ClientId: c.clientId, Username: phone, ConfirmationCode: code })); });
export const resendCode = (phone: string) => run("confirm", async (c) => { await client.send(new ResendConfirmationCodeCommand({ ClientId: c.clientId, Username: phone })); });

export type Tokens = { accessToken: string; refreshToken: string; accessExp: number };
export const login = (phone: string, password: string) => run("login", async (c): Promise<Tokens> => {
  const r = await client.send(new InitiateAuthCommand({ ClientId: c.clientId, AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: phone, PASSWORD: password } }));
  const a = r.AuthenticationResult;
  if (!a?.AccessToken || !a.RefreshToken) throw new AuthError(502, "ระบบยืนยันตัวตนตอบกลับไม่ครบ (บัญชีอาจต้องทำขั้นตอนเพิ่ม)");
  return { accessToken: a.AccessToken, refreshToken: a.RefreshToken, accessExp: expOf(a.AccessToken) };
});
export const refresh = (refreshToken: string) => run("refresh", async (c) => {
  const r = await client.send(new InitiateAuthCommand({ ClientId: c.clientId, AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: refreshToken } }));
  const t = r.AuthenticationResult?.AccessToken;
  if (!t) throw new AuthError(401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  return { accessToken: t, accessExp: expOf(t) };
});
export const revoke = (refreshToken: string) => run("other", async (c) => { await client.send(new RevokeTokenCommand({ ClientId: c.clientId, Token: refreshToken })); }).catch(() => {}); // best-effort
export const forgotPassword = (phone: string) => run("forgot", async (c) => { await client.send(new ForgotPasswordCommand({ ClientId: c.clientId, Username: phone })); });
export const resetPassword = (phone: string, code: string, password: string) => run("reset", async (c) => { await client.send(new ConfirmForgotPasswordCommand({ ClientId: c.clientId, Username: phone, ConfirmationCode: code, Password: password })); });

export const getProfile = (accessToken: string) => run("other", async () => {
  const r = await client.send(new GetUserCommand({ AccessToken: accessToken }));
  const at = (n: string) => r.UserAttributes?.find((a) => a.Name === n)?.Value ?? null;
  return { phone: at("phone_number"), name: at("name") };
});

function expOf(jwt: string): number { try { return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).exp; } catch { return 0; } }

/** ตรวจลายเซ็น (JWKS ของ user pool) + issuer + ชนิดโทเคน + app client → คืน sub; หมดอายุ → { expired: true } */
export async function verifyAccessToken(token: string): Promise<{ sub: string } | { expired: true } | null> {
  const c = await config();
  try {
    const { payload } = await jwtVerify(token, c.jwks, { issuer: c.issuer });
    if (payload.token_use !== "access" || payload.client_id !== c.clientId || !payload.sub) return null;
    return { sub: payload.sub };
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) return { expired: true };
    return null;
  }
}
