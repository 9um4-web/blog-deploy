/**
 * 레이트리밋 키로 쓸 클라이언트 식별자 추출.
 * Cloudflare(Tunnel/프록시) 뒤에서는 cf-connecting-ip가 위조 불가능한 실제 클라이언트 IP.
 * 없으면 x-forwarded-for의 첫 IP, 그마저 없으면 소켓 주소로 폴백.
 * (express의 app.set('trust proxy', ...)를 켜둔 상태에서만 x-forwarded-for를 신뢰할 것)
 */
function clientKey(req) {
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp) return cfIp;

  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  return req.socket?.remoteAddress || "unknown";
}

module.exports = { clientKey };
