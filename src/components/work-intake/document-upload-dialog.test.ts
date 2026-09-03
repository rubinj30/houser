import { describe, expect, it } from "vitest";
import { validateUploadFile } from "./document-upload-dialog";

const file = (type: string, size = 1_024) => ({ type, size });

describe("validateUploadFile", () => {
  it("accepts PDFs for document imports", () => {
    expect(validateUploadFile("inspection", file("application/pdf"))).toBeNull();
    expect(validateUploadFile("invoice", file("application/pdf"))).toBeNull();
  });

  it("rejects image content for document imports", () => {
    expect(validateUploadFile("quote", file("image/jpeg"))).toBe("Choose a PDF smaller than 50 MB.");
  });

  it("accepts supported images and rejects unsupported photo formats", () => {
    expect(validateUploadFile("photo", file("image/webp"))).toBeNull();
    expect(validateUploadFile("photo", file("image/svg+xml"))).toBe("Choose a JPEG, PNG, WebP, or GIF image smaller than 50 MB.");
  });

  it("enforces the private upload size limit", () => {
    expect(validateUploadFile("receipt", file("application/pdf", 52_428_801))).toBe("Choose a PDF smaller than 50 MB.");
    expect(validateUploadFile("photo", file("image/png", 52_428_801))).toBe("Choose a JPEG, PNG, WebP, or GIF image smaller than 50 MB.");
  });
});
