import { describe, expect, it } from "vitest";
import { pdfHasActiveContent, sniffDocumentMimeType } from "@/lib/medicalDocuments";

describe("sniffDocumentMimeType", () => {
  const bytes = (...xs: number[]) => new Uint8Array(xs);
  const text = (s: string) => new TextEncoder().encode(s);

  it("reads each allowed type from its own bytes", () => {
    expect(sniffDocumentMimeType(text("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(sniffDocumentMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffDocumentMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffDocumentMimeType(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffDocumentMimeType(text("\0\0\0\x18ftypheic"))).toBe("image/heic");
    expect(sniffDocumentMimeType(text("\0\0\0\x18ftypmif1"))).toBe("image/heif");
  });

  it("refuses a file whose bytes are not a report, whatever it claims to be", () => {
    expect(sniffDocumentMimeType(text("MZ\x90\0"))).toBeNull(); // a Windows executable
    expect(sniffDocumentMimeType(text("<html><script>"))).toBeNull();
    expect(sniffDocumentMimeType(text("PK\x03\x04"))).toBeNull(); // a zip
  });
});

describe("pdfHasActiveContent", () => {
  const text = (s: string) => new TextEncoder().encode(s);

  it("passes an ordinary report", () => {
    expect(pdfHasActiveContent(text("%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >>"))).toBe(false);
    expect(pdfHasActiveContent(text("%PDF-1.7\n<< /OpenAction [3 0 R /Fit] /JSize 3 >>"))).toBe(false);
  });

  it("refuses scripts, launch actions and embedded files", () => {
    expect(pdfHasActiveContent(text("%PDF-1.7\n<< /S /JavaScript /JS (app.alert(1)) >>"))).toBe(true);
    expect(pdfHasActiveContent(text("%PDF-1.7\n<< /S /Launch /F (cmd.exe) >>"))).toBe(true);
    expect(pdfHasActiveContent(text("%PDF-1.7\n<< /EmbeddedFiles 4 0 R >>"))).toBe(true);
  });

  it("sees through hex-escaped names", () => {
    expect(pdfHasActiveContent(text("%PDF-1.7\n<< /S /Java#53cript >>"))).toBe(true);
  });
});
