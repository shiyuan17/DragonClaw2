function findOverlapLength(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length);
  for (let length = maxLength; length > 0; length -= 1) {
    if (left.endsWith(right.slice(0, length))) {
      return length;
    }
  }
  return 0;
}

export function mergeWorkspaceStreamText(current: string | null | undefined, nextChunk: string) {
  const next = nextChunk;
  if (!next) {
    return current ?? "";
  }

  const previous = current ?? "";
  if (!previous) {
    return next;
  }

  if (next === previous || previous.endsWith(next) || previous.includes(next)) {
    return previous;
  }

  if (next.startsWith(previous)) {
    return next;
  }

  const overlapLength = findOverlapLength(previous, next);
  return `${previous}${next.slice(overlapLength)}`;
}
