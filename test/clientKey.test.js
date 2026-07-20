import { describe, it, expect } from "vitest";
import { clientKey } from "../src/clientKey.js";

describe("clientKey", () => {
  it("cf-connecting-ip를 최우선으로 쓴다", () => {
    const req = { headers: { "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }, socket: {} };
    expect(clientKey(req)).toBe("1.1.1.1");
  });

  it("cf-connecting-ip가 없으면 x-forwarded-for의 첫 IP를 쓴다", () => {
    const req = { headers: { "x-forwarded-for": "2.2.2.2, 3.3.3.3" }, socket: {} };
    expect(clientKey(req)).toBe("2.2.2.2");
  });

  it("둘 다 없으면 소켓 주소로 폴백한다", () => {
    const req = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
    expect(clientKey(req)).toBe("127.0.0.1");
  });

  it("아무것도 없으면 unknown", () => {
    const req = { headers: {}, socket: {} };
    expect(clientKey(req)).toBe("unknown");
  });
});
