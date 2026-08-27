// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ack,
  addPath,
  COMPANION_APP_ID,
  COMPANION_VERSION,
  companionUrl,
  generateCompanionNonce,
  hello,
  imageMessage,
  isValidCompanionNonce,
  join,
  parseCompanionMessage,
  readCompanionNonce,
  storeCompanionNonce,
} from "@/lib/companion";
import { PEER_NAMESPACE, ROOM_CODE_LENGTH } from "@/lib/room";

const SRC = "data:image/webp;base64,AAAA";

describe("pairing nonces", () => {
  it("mints a nonce the route accepts", () => {
    expect(isValidCompanionNonce(generateCompanionNonce())).toBe(true);
  });

  it("mints lower case hex and nothing else", () => {
    const nonces = Array.from({ length: 200 }, generateCompanionNonce).join("");

    expect(nonces).toMatch(/^[0-9a-f]+$/);
  });

  it("does not repeat itself", () => {
    const nonces = new Set(Array.from({ length: 200 }, generateCompanionNonce));

    expect(nonces.size).toBe(200);
  });

  it("rejects anything that is not a full nonce", () => {
    expect(isValidCompanionNonce("")).toBe(false);
    expect(isValidCompanionNonce("ABCDEF0123456789abcdef01")).toBe(false);
    expect(isValidCompanionNonce("0123456789abcdef0123456")).toBe(false);
    expect(isValidCompanionNonce("0123456789abcdef012345678")).toBe(false);
    expect(isValidCompanionNonce("../../etc/passwd")).toBe(false);
  });
});

describe("pairing addresses", () => {
  const nonce = "0123456789abcdef01234567";

  it("shares the app id boards use, since relays are picked by app id", () => {
    expect(COMPANION_APP_ID).toBe(PEER_NAMESPACE);
  });

  it("cannot be mistaken for a board code, which shares that app id", () => {
    expect(generateCompanionNonce()).not.toHaveLength(ROOM_CODE_LENGTH);
  });

  it("keeps the room code out of the phone link", () => {
    expect(addPath(nonce)).toBe(`/add/${nonce}`);
    expect(companionUrl(nonce)).toBe(`http://localhost:3000/add/${nonce}`);
  });
});

describe("stored nonce", () => {
  beforeEach(() => localStorage.clear());

  it("reads back nothing before a board has paired", () => {
    expect(readCompanionNonce("ABCDE")).toBeNull();
  });

  it("round trips per board", () => {
    storeCompanionNonce("ABCDE", "0123456789abcdef01234567");
    storeCompanionNonce("FGHJK", "89abcdef0123456789abcdef");

    expect(readCompanionNonce("ABCDE")).toBe("0123456789abcdef01234567");
    expect(readCompanionNonce("FGHJK")).toBe("89abcdef0123456789abcdef");
  });

  it("ignores a hand edited entry that is not a nonce", () => {
    localStorage.setItem("slate-cam-ABCDE", "not-a-nonce");

    expect(readCompanionNonce("ABCDE")).toBeNull();
  });
});

describe("messages", () => {
  it("round trips a hello", () => {
    expect(parseCompanionMessage(hello("ABCDE", "Ada"))).toEqual({
      v: COMPANION_VERSION,
      kind: "hello",
      code: "ABCDE",
      name: "Ada",
    });
  });

  it("round trips a join and keeps the role it announced", () => {
    expect(parseCompanionMessage(join("host", "peer-1"))).toEqual({
      v: COMPANION_VERSION,
      kind: "join",
      role: "host",
      id: "peer-1",
    });
    expect(parseCompanionMessage(join("phone", "peer-2"))).toMatchObject({
      role: "phone",
    });
  });

  it("refuses a join that does not say what it is", () => {
    expect(
      parseCompanionMessage({ ...join("host", "peer-1"), role: "printer" }),
    ).toBeNull();
    expect(
      parseCompanionMessage({ ...join("host", "peer-1"), id: 7 }),
    ).toBeNull();
  });

  it("round trips an image and gives it an id to ack", () => {
    const message = imageMessage({ src: SRC, ratio: 1.5 });
    const parsed = parseCompanionMessage(message);

    expect(parsed).toEqual(message);
    expect(message.id).toBeTypeOf("string");
  });

  it("round trips an ack with and without a reason", () => {
    expect(parseCompanionMessage(ack("id", true))).toMatchObject({
      kind: "ack",
      ok: true,
    });
    expect(parseCompanionMessage(ack("id", false, "too-large"))).toMatchObject({
      ok: false,
      reason: "too-large",
    });
  });

  it("refuses a version it cannot read", () => {
    expect(
      parseCompanionMessage({ ...hello("ABCDE", "Ada"), v: 99 }),
    ).toBeNull();
  });

  it("refuses anything that is not a message at all", () => {
    expect(parseCompanionMessage(null)).toBeNull();
    expect(parseCompanionMessage("hello")).toBeNull();
    expect(parseCompanionMessage(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(parseCompanionMessage({ v: COMPANION_VERSION })).toBeNull();
    expect(
      parseCompanionMessage({ v: COMPANION_VERSION, kind: "shrug" }),
    ).toBeNull();
  });

  it("refuses an image with a field missing or the wrong shape", () => {
    const good = imageMessage({ src: SRC, ratio: 1.5 });

    expect(parseCompanionMessage({ ...good, src: undefined })).toBeNull();
    expect(parseCompanionMessage({ ...good, id: 7 })).toBeNull();
    expect(parseCompanionMessage({ ...good, ratio: "wide" })).toBeNull();
    expect(parseCompanionMessage({ ...good, ratio: 0 })).toBeNull();
    expect(parseCompanionMessage({ ...good, ratio: Number.NaN })).toBeNull();
  });

  it("refuses a src that is not an inline image", () => {
    const good = imageMessage({ src: SRC, ratio: 1.5 });

    expect(
      parseCompanionMessage({ ...good, src: "https://example.com/cat.png" }),
    ).toBeNull();
    expect(
      parseCompanionMessage({ ...good, src: "javascript:alert(1)" }),
    ).toBeNull();
  });
});
