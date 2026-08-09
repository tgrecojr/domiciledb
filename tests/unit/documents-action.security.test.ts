import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const deleteDocument = vi.fn();
const getDocument = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/queries/documents", () => ({
  addDocument: vi.fn(),
  deleteDocument,
  getDocument,
}));

const REL = path.join("media", "documents", "items", "1", "abc-receipt.pdf");

describe("deleteDocumentAction on-disk cleanup (VULN-015)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("removes the stored file when the document row is deleted", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vuln015-unit-"));
    const abs = path.join(dataDir, REL);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "receipt-bytes");

    vi.resetModules();
    vi.stubEnv("DATA_DIR", dataDir);
    getDocument.mockReturnValue({ id: 7, itemId: 1, path: REL });

    const { deleteDocumentAction } = await import("@/lib/actions/documents");
    const fd = new FormData();
    fd.set("itemId", "1");
    fd.set("docId", "7");
    await deleteDocumentAction(fd);

    expect(deleteDocument).toHaveBeenCalledWith(7);
    expect(fs.existsSync(abs)).toBe(false);

    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
