export type ChatConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

export class ChatConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatConfigurationError";
  }
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

function resolveBaseUrl(rawValue: string | undefined): string {
  const value = rawValue?.trim() || DEFAULT_BASE_URL;
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new ChatConfigurationError("DeepSeek 服务地址配置无效。");
  }

  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ChatConfigurationError("DeepSeek 服务地址配置无效。");
  }

  return value.replace(/\/+$/, "");
}

function resolveTimeout(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_TIMEOUT_MS) {
    throw new ChatConfigurationError("DeepSeek 超时配置无效。");
  }

  return parsed;
}

export function getChatConfig(): ChatConfig {
  const apiKey = process.env.DOCLENS_DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new ChatConfigurationError("DeepSeek API 尚未配置，请联系管理员完成服务端设置。");
  }

  const model = process.env.DOCLENS_DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;

  return {
    apiKey,
    baseUrl: resolveBaseUrl(process.env.DOCLENS_DEEPSEEK_BASE_URL),
    model,
    timeoutMs: resolveTimeout(process.env.DOCLENS_DEEPSEEK_TIMEOUT_MS)
  };
}
