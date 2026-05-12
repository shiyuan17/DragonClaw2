import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceComposerAttachment } from "./workspaceCloneTypes";

const attachmentMocks = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path.replace(/\\/g, "/")}`),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: attachmentMocks.convertFileSrc,
}));

import {
  buildWorkspaceGatewayChatAttachments,
  extractWorkspaceMessageAttachments,
  formatWorkspaceAttachmentSize,
  mergeWorkspaceComposerAttachments,
  readWorkspaceComposerFiles,
  resolveWorkspaceAttachmentKind,
} from "./workspaceCloneChatAttachments";

class FakeFileReader {
  result: string | null = null;
  error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL(file: File) {
    this.result = `data:application/octet-stream;base64,${btoa(file.name)}`;
    this.onload?.();
  }
}

describe("workspaceCloneChatAttachments", () => {
  let attachmentId = 0;

  beforeEach(() => {
    attachmentId = 0;
    attachmentMocks.convertFileSrc.mockClear();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `attachment-${++attachmentId}`),
    });
  });

  it("classifies attachments by MIME type and file extension", () => {
    expect(resolveWorkspaceAttachmentKind("image/png", "demo.bin")).toBe("image");
    expect(resolveWorkspaceAttachmentKind("audio/mpeg", "demo.bin")).toBe("audio");
    expect(resolveWorkspaceAttachmentKind("video/mp4", "demo.bin")).toBe("video");
    expect(resolveWorkspaceAttachmentKind("text/plain", "notes.md")).toBe("text");
    expect(resolveWorkspaceAttachmentKind("text/plain", "script.ts")).toBe("code");
    expect(resolveWorkspaceAttachmentKind("application/json", "payload.txt")).toBe("code");
    expect(resolveWorkspaceAttachmentKind("application/octet-stream", "archive.zip")).toBe("archive");
    expect(resolveWorkspaceAttachmentKind("application/octet-stream", "deck.pdf")).toBe("document");
    expect(resolveWorkspaceAttachmentKind("application/octet-stream", "mystery.bin")).toBe("file");
  });

  it("merges composer attachments by fingerprint and serializes only valid gateway payloads", () => {
    const current: WorkspaceComposerAttachment[] = [
      {
        id: "existing",
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 10,
        kind: "image",
        transportType: "image",
        dataUrl: "data:image/png;base64,AAAA",
        previewUrl: "data:image/png;base64,AAAA",
      },
    ];
    const incoming: WorkspaceComposerAttachment[] = [
      {
        id: "duplicate",
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 10,
        kind: "image",
        transportType: "image",
        dataUrl: "data:image/png;base64,BBBB",
        previewUrl: "data:image/png;base64,BBBB",
      },
      {
        id: "new",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 20,
        kind: "document",
        transportType: "file",
        dataUrl: "data:application/pdf;base64,CCCC",
        previewUrl: null,
      },
      {
        id: "invalid",
        fileName: "bad.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        kind: "text",
        transportType: "file",
        dataUrl: "/tmp/not-a-data-url",
        previewUrl: null,
      },
    ];

    const merged = mergeWorkspaceComposerAttachments(current, incoming);
    expect(merged.map((item) => item.id)).toEqual(["existing", "new", "invalid"]);

    expect(buildWorkspaceGatewayChatAttachments(merged)).toEqual([
      {
        type: "image",
        mimeType: "image/png",
        fileName: "photo.png",
        content: "AAAA",
      },
      {
        type: "file",
        mimeType: "application/pdf",
        fileName: "report.pdf",
        content: "CCCC",
      },
    ]);
  });

  it("formats attachment sizes across common unit boundaries", () => {
    expect(formatWorkspaceAttachmentSize(0)).toBe("");
    expect(formatWorkspaceAttachmentSize(1024)).toBe("1.00 KB");
    expect(formatWorkspaceAttachmentSize(10 * 1024)).toBe("10.0 KB");
    expect(formatWorkspaceAttachmentSize(100 * 1024)).toBe("100 KB");
    expect(formatWorkspaceAttachmentSize(1024 * 1024)).toBe("1.00 MB");
  });

  it("extracts attachments from mixed content blocks and MediaPaths with dedupe", () => {
    const attachments = extractWorkspaceMessageAttachments({
      content: [
        {
          type: "image",
          url: "https://cdn.example.com/cover.png",
          mimeType: "image/png",
        },
        {
          type: "attachment",
          attachment: {
            url: "file:///C:/tmp/report.pdf",
            label: "Report.pdf",
            mimeType: "application/pdf",
          },
        },
        {
          type: "attachment",
          attachment: {
            url: "https://cdn.example.com/cover.png",
            label: "cover.png",
            mimeType: "image/png",
          },
        },
      ],
      MediaPaths: ["C:\\tmp\\photo.jpg", "C:\\tmp\\notes.md", "C:\\tmp\\photo.jpg"],
      MediaTypes: ["image/jpeg", "", "image/jpeg"],
    });

    expect(attachments).toHaveLength(4);
    expect(attachments[0]).toMatchObject({
      fileName: "cover.png",
      kind: "image",
      previewUrl: "https://cdn.example.com/cover.png",
    });
    expect(attachments[1]).toMatchObject({
      fileName: "Report.pdf",
      kind: "document",
      previewUrl: "file:///C:/tmp/report.pdf",
    });
    expect(attachments[2]).toMatchObject({
      fileName: "photo.jpg",
      kind: "image",
      sourcePath: "C:\\tmp\\photo.jpg",
      previewUrl: "asset://C:/tmp/photo.jpg",
    });
    expect(attachments[3]).toMatchObject({
      fileName: "notes.md",
      kind: "text",
      previewUrl: null,
    });
  });

  it("keeps extracting message attachments when convertFileSrc fails for image media paths", () => {
    attachmentMocks.convertFileSrc.mockImplementationOnce(() => {
      throw new Error("cannot preview");
    });

    const attachments = extractWorkspaceMessageAttachments({
      MediaPath: "C:\\tmp\\photo.jpg",
      MediaType: "image/jpeg",
    });

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      fileName: "photo.jpg",
      kind: "image",
      previewUrl: null,
      sourcePath: "C:\\tmp\\photo.jpg",
    });
  });

  it("reads composer files, derives MIME fallbacks, and removes duplicate uploads", async () => {
    vi.stubGlobal("FileReader", FakeFileReader as unknown as typeof FileReader);

    const attachments = await readWorkspaceComposerFiles([
      new File(["let x = 1;"], "script.ts", { type: "" }),
      new File(["image"], "photo.png", { type: "image/png" }),
      new File(["image"], "photo.png", { type: "image/png" }),
    ]);

    expect(attachments).toHaveLength(2);
    expect(attachments[0]).toMatchObject({
      fileName: "script.ts",
      mimeType: "text/typescript",
      kind: "code",
      transportType: "file",
      previewUrl: null,
    });
    expect(attachments[1]).toMatchObject({
      fileName: "photo.png",
      mimeType: "image/png",
      kind: "image",
      transportType: "image",
    });
    expect(attachments[1]?.previewUrl).toContain("base64");
  });
});
