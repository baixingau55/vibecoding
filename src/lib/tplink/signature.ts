import crypto from "node:crypto";

export interface SignedRequest {
  authorization: string;
  terminalId: string;
  timestamp: number;
  nonce: string;
}

function hmacSha256(message: string, secret: string | Buffer, encoding?: crypto.BinaryToTextEncoding) {
  const hmac = crypto.createHmac("sha256", secret);
  return encoding ? hmac.update(message).digest(encoding) : hmac.update(message).digest();
}

function hashSha256(message: string) {
  return crypto.createHash("sha256").update(message).digest("hex");
}

export function createTpLinkAuthorization(input: {
  accessKey: string;
  secretKey: string;
  path: string;
  payload?: unknown;
  timestamp?: number;
  nonce?: string;
  terminalId?: string;
  method?: "POST";
}) {
  const method = input.method ?? "POST";
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = input.nonce ?? crypto.randomUUID().replace(/-/g, "");
  const terminalId = input.terminalId ?? crypto.randomUUID().replace(/-/g, "");
  const payloadString =
    input.payload === undefined
      ? "{}"
      : typeof input.payload === "string"
        ? input.payload
        : JSON.stringify(input.payload);
  const hashedRequestPayload = hashSha256(payloadString || "{}");
  const credentialScope = `${method} ${input.path} tp-link_request`;
  const stringToSign = `HmacSHA256\n${timestamp}\n${credentialScope}\n${hashedRequestPayload}`;
  const kDate = hmacSha256(String(timestamp), input.secretKey);
  const kService = hmacSha256(input.path, kDate);
  const kSigning = hmacSha256("tp-link", kService);
  const signature = hmacSha256(stringToSign, kSigning, "hex");

  const authorization = [
    `Timestamp=${timestamp}`,
    `Nonce=${nonce}`,
    `AccessKey=${input.accessKey}`,
    `Signature=${signature}`,
    `TerminalId=${terminalId}`
  ].join(",");

  const signedRequest: SignedRequest = {
    authorization,
    terminalId,
    timestamp,
    nonce
  };

  return { signedRequest, payloadString, stringToSign, signature };
}
