import { beforeEach, describe, expect, it, vi } from "vitest";

const heicToMock = vi.fn();

vi.mock("heic-to", () => ({
  heicTo: (...args: unknown[]) => heicToMock(...args),
}));

describe("normalizeImageUpload", () => {
  beforeEach(() => {
    heicToMock.mockReset();
  });

  it("detects HEIC/HEIF files by mime type and extension", async () => {
    const { isHeicLike } = await import("@/lib/normalizeImageUpload");

    expect(isHeicLike(new File(["x"], "photo.heic", { type: "image/heic" }))).toBe(true);
    expect(isHeicLike(new File(["x"], "photo.HEIF", { type: "" }))).toBe(true);
    expect(isHeicLike(new File(["x"], "photo.jpg", { type: "image/jpeg" }))).toBe(false);
  });

  it("returns non-HEIC files unchanged", async () => {
    const { normalizeImageUpload } = await import("@/lib/normalizeImageUpload");
    const file = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" });

    const result = await normalizeImageUpload(file);

    expect(result).toBe(file);
    expect(heicToMock).not.toHaveBeenCalled();
  });

  it("converts HEIC files to jpeg", async () => {
    const { normalizeImageUpload } = await import("@/lib/normalizeImageUpload");
    heicToMock.mockResolvedValue(new Blob(["converted"], { type: "image/jpeg" }));

    const file = new File(["heic"], "IMG_0001.HEIC", { type: "image/heic" });
    const result = await normalizeImageUpload(file);

    expect(heicToMock).toHaveBeenCalledWith({
      blob: file,
      type: "image/jpeg",
      quality: 0.92,
    });
    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe("IMG_0001.jpg");
    expect(result.type).toBe("image/jpeg");
  });

  it("throws a user-friendly error when HEIC conversion fails", async () => {
    const { normalizeImageUpload } = await import("@/lib/normalizeImageUpload");
    heicToMock.mockRejectedValue(new Error("decode failed"));

    await expect(
      normalizeImageUpload(new File(["heic"], "IMG_0001.heic", { type: "image/heic" }))
    ).rejects.toThrow(
      "We couldn’t process this iPhone photo automatically. Please try another photo, or set your iPhone camera format to Most Compatible."
    );
  });
});
