export function formatClockTime(timestamp?: number | null) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatRelativeSessionTime(timestamp?: number | null) {
  if (!timestamp) {
    return "暂无记录";
  }

  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const dayLabel = sameDay
    ? "今天"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
      }).format(date);

  return `${dayLabel} ${formatClockTime(timestamp)}`;
}

export function formatHistorySessionTime(timestamp?: number | null) {
  if (!timestamp) {
    return "暂无记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
