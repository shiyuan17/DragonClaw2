const SUSPECT_MOJIBAKE_TOKENS = [
  "锛",
  "锟",
  "鈥",
  "鏆傛",
  "褰撳",
  "鍘嗗彶",
  "浼氳瘽",
  "鏃ュ織",
  "鍏抽棴",
  "宸插",
  "妫€",
  "璇峰",
  "鏈嶅姟",
  "渚濊",
  "姝ｅ湪",
  "鍔犺浇",
  "娌℃湁",
  "鍖归厤",
  "涓讳細",
  "鑱婂ぉ",
  "鏂囦欢",
  "绯荤粺",
  "鎶€鑳",
  "鍏ㄩ儴",
];

export function normalizeVisibleText(value: string) {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeMojibakeText(value?: string | null) {
  const normalized = normalizeVisibleText(value || "");
  if (!normalized) {
    return false;
  }

  const compact = normalized.replace(/\s+/g, "");
  if (/[\uFFFD\uE000-\uF8FF]/.test(normalized)) {
    return true;
  }

  return SUSPECT_MOJIBAKE_TOKENS.some((token) => compact.includes(token));
}

export function sanitizeReadableText(value?: string | null) {
  const normalized = normalizeVisibleText(value || "");
  if (!normalized || looksLikeMojibakeText(normalized)) {
    return "";
  }

  return normalized;
}
