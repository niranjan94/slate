const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Namespaces this app's rooms on the relay network everyone else shares. */
export const PEER_NAMESPACE = "slate-wb";

export const ROOM_CODE_LENGTH = 5;

/** Generates a room code from the ambiguity-free alphabet the lobby input expects. */
export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH;
}

export function boardPath(code: string): string {
  return `/b/${code}`;
}

export function inviteUrl(code: string): string {
  return new URL(boardPath(code), window.location.origin).toString();
}

const DISPLAY_NAMES = [
  "Ada",
  "Basil",
  "Cleo",
  "Dara",
  "Emil",
  "Fern",
  "Gus",
  "Hana",
  "Iris",
  "Juno",
  "Kit",
  "Lior",
  "Mina",
  "Nero",
  "Otis",
  "Pia",
  "Quill",
  "Rune",
  "Sage",
  "Tove",
  "Umi",
  "Vera",
  "Wren",
  "Zev",
];

export function displayNameFor(clientId: number): string {
  return DISPLAY_NAMES[clientId % DISPLAY_NAMES.length];
}

const NAME_STORAGE_KEY = "slate-name";

export const MAX_NAME_LENGTH = 18;

/** Keeps a typed name to one line so it still fits a cursor label and a roster chip. */
export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trimStart().slice(0, MAX_NAME_LENGTH);
}

/** The chosen name follows the person across boards, so it lives outside the per-room doc. */
export function readStoredName(): string {
  try {
    return sanitizeName(localStorage.getItem(NAME_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function storeName(name: string): void {
  try {
    if (name) localStorage.setItem(NAME_STORAGE_KEY, name);
    else localStorage.removeItem(NAME_STORAGE_KEY);
  } catch {
    return;
  }
}
