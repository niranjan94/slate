// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  boardPath,
  displayNameFor,
  generateRoomCode,
  inviteUrl,
  isValidRoomCode,
  MAX_NAME_LENGTH,
  normalizeRoomCode,
  peerSlotId,
  ROOM_CODE_LENGTH,
  readStoredName,
  sanitizeName,
  storeName,
} from "@/lib/room";

describe("room codes", () => {
  it("generates a code of the expected length", () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("avoids the characters people misread", () => {
    const codes = Array.from({ length: 200 }, generateRoomCode).join("");

    expect(codes).not.toMatch(/[IO01]/);
  });

  it("generates a code the join field accepts", () => {
    const code = generateRoomCode();

    expect(normalizeRoomCode(code)).toBe(code);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it("uppercases what someone types", () => {
    expect(normalizeRoomCode("abcde")).toBe("ABCDE");
  });

  it("drops punctuation and spaces from a pasted code", () => {
    expect(normalizeRoomCode(" ab-cd e ")).toBe("ABCDE");
  });

  it("truncates rather than accepting an overlong code", () => {
    expect(normalizeRoomCode("ABCDEFGHI")).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("rejects a short code", () => {
    expect(isValidRoomCode("ABC")).toBe(false);
    expect(isValidRoomCode("")).toBe(false);
  });
});

describe("peer slots", () => {
  it("gives the two slots of a board different broker ids", () => {
    expect(peerSlotId("ABCDE", "a")).not.toBe(peerSlotId("ABCDE", "b"));
  });

  it("keeps separate boards apart", () => {
    expect(peerSlotId("ABCDE", "a")).not.toBe(peerSlotId("FGHJK", "a"));
  });

  it("namespaces ids so the shared broker does not collide", () => {
    expect(peerSlotId("ABCDE", "a")).toContain("slate-wb");
  });
});

describe("links", () => {
  it("builds the board path from a code", () => {
    expect(boardPath("ABCDE")).toBe("/b/ABCDE");
  });

  it("builds an absolute invite url", () => {
    expect(inviteUrl("ABCDE")).toBe(`${window.location.origin}/b/ABCDE`);
  });
});

describe("generated names", () => {
  it("gives the same client id the same name every time", () => {
    expect(displayNameFor(12345)).toBe(displayNameFor(12345));
  });

  it("copes with the large client ids Yjs hands out", () => {
    expect(displayNameFor(4294967295)).toBeTypeOf("string");
    expect(displayNameFor(0)).toBeTypeOf("string");
  });

  it("never returns an empty label", () => {
    for (let id = 0; id < 60; id += 1) {
      expect(displayNameFor(id).length).toBeGreaterThan(0);
    }
  });
});

describe("sanitizeName", () => {
  it("keeps an ordinary name intact", () => {
    expect(sanitizeName("Ada Lovelace")).toBe("Ada Lovelace");
  });

  it("collapses runs of whitespace", () => {
    expect(sanitizeName("Ada   \t Lovelace")).toBe("Ada Lovelace");
  });

  it("allows a trailing space so a two word name can be typed", () => {
    expect(sanitizeName("Ada ")).toBe("Ada ");
  });

  it("drops leading space", () => {
    expect(sanitizeName("   Ada")).toBe("Ada");
  });

  it("caps a name at a length that still fits a cursor label", () => {
    expect(sanitizeName("Bartholomew Fitzgerald III")).toHaveLength(
      MAX_NAME_LENGTH,
    );
  });

  it("flattens a pasted newline instead of breaking the label", () => {
    expect(sanitizeName("Ada\nLovelace")).toBe("Ada Lovelace");
  });

  it("leaves an empty name empty", () => {
    expect(sanitizeName("")).toBe("");
    expect(sanitizeName("   ")).toBe("");
  });
});

describe("stored name", () => {
  beforeEach(() => localStorage.clear());

  it("reads back nothing when nobody has named themselves", () => {
    expect(readStoredName()).toBe("");
  });

  it("round trips a chosen name", () => {
    storeName("Ada");

    expect(readStoredName()).toBe("Ada");
  });

  it("survives a name stored by an older or hand-edited entry", () => {
    localStorage.setItem("slate-name", "  Bartholomew Fitzgerald III  ");

    expect(readStoredName()).toBe("Bartholomew Fitzge");
  });

  it("forgets the name when it is cleared", () => {
    storeName("Ada");
    storeName("");

    expect(localStorage.getItem("slate-name")).toBeNull();
    expect(readStoredName()).toBe("");
  });
});
