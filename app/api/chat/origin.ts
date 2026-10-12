export function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site")?.trim().toLowerCase() === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin === null) {
    return true;
  }

  let requestUrl: URL;
  let originUrl: URL;
  try {
    requestUrl = new URL(request.url);
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  if (
    (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") ||
    originUrl.origin === "null" ||
    originUrl.username !== "" ||
    originUrl.password !== "" ||
    originUrl.pathname !== "/" ||
    originUrl.search !== "" ||
    originUrl.hash !== ""
  ) {
    return false;
  }

  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  let expectedProtocol = requestUrl.protocol;
  if (forwardedProtocol !== null) {
    const normalizedProtocol = forwardedProtocol.trim();
    if (normalizedProtocol !== "http" && normalizedProtocol !== "https") {
      return false;
    }
    expectedProtocol = `${normalizedProtocol}:`;
  }

  if (expectedProtocol !== "http:" && expectedProtocol !== "https:") {
    return false;
  }

  const hostHeader = request.headers.get("host");
  const expectedHost = hostHeader === null ? requestUrl.host : hostHeader.trim();
  if (!expectedHost || /[\s/?#@\\]/.test(expectedHost)) {
    return false;
  }

  let expectedUrl: URL;
  try {
    expectedUrl = new URL(`${expectedProtocol}//${expectedHost}/`);
  } catch {
    return false;
  }

  if (
    expectedUrl.username !== "" ||
    expectedUrl.password !== "" ||
    expectedUrl.pathname !== "/" ||
    expectedUrl.search !== "" ||
    expectedUrl.hash !== "" ||
    expectedUrl.host === ""
  ) {
    return false;
  }

  return originUrl.protocol === expectedUrl.protocol && originUrl.host === expectedUrl.host;
}
