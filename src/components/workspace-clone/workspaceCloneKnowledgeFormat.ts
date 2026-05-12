import TurndownService from "turndown";
import { marked } from "marked";

const turndownService = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx",
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeLakeHtml(value: string) {
  return value.trim() || "<p><br /></p>";
}

export function isKnowledgeTextFormat(format: string) {
  return format === "markdown" || format === "text" || format === "html";
}

export function convertKnowledgeSourceToLakeHtml(source: string, format: string) {
  if (format === "markdown") {
    return normalizeLakeHtml(marked.parse(source) as string);
  }

  if (format === "text") {
    const normalized = source.replace(/\r\n/g, "\n");
    const paragraphs = normalized.split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
    if (paragraphs.length === 0) {
      return "<p><br /></p>";
    }

    return paragraphs
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
      .join("");
  }

  if (format === "html") {
    return normalizeLakeHtml(source);
  }

  return "<p><br /></p>";
}

export function convertKnowledgeLakeHtmlToSource(html: string, format: string) {
  const normalizedHtml = normalizeLakeHtml(html);
  if (format === "markdown") {
    return turndownService.turndown(normalizedHtml).trim();
  }

  if (format === "text") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(normalizedHtml, "text/html");
    const blocks = Array.from(doc.body.children)
      .map((element) => element.textContent?.trim() || "")
      .filter(Boolean);

    if (blocks.length > 0) {
      return blocks.join("\n\n");
    }

    return doc.body.textContent?.trim() || "";
  }

  if (format === "html") {
    return normalizedHtml;
  }

  return "";
}
