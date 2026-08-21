import { describe, it, expect } from "vitest";
import { generateTextPdf } from "./pdf";

function asString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("generateTextPdf", () => {
  it("produces a well-formed single-page PDF for a short statement", () => {
    const pdf = generateTextPdf(["COFUNDR ACCOUNT STATEMENT", "Cash Balance: RM 100.00"]);
    const text = asString(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trim().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Count 1"); // one page
    expect(text).toContain("(COFUNDR ACCOUNT STATEMENT)");
  });

  it("paginates when there are more lines than fit on one page", () => {
    const manyLines = Array.from({ length: 130 }, (_, i) => `Line ${i + 1}`);
    const pdf = generateTextPdf(manyLines);
    const text = asString(pdf);
    // 130 lines at 54/page needs 3 pages.
    expect(text).toContain("/Count 3");
    expect(text).toContain("(Line 1)");
    expect(text).toContain("(Line 130)");
  });

  it("handles an empty statement without throwing", () => {
    const pdf = generateTextPdf([]);
    expect(asString(pdf).startsWith("%PDF-1.4")).toBe(true);
  });

  it("escapes PDF-special characters so the stream stays parseable", () => {
    const pdf = generateTextPdf(["Note (with parens) and a \\ backslash"]);
    const text = asString(pdf);
    expect(text).toContain("Note \\(with parens\\) and a \\\\ backslash");
  });

  it("keeps each stream's declared /Length equal to its actual byte length", () => {
    const pdf = generateTextPdf(["Cash Balance: RM 14,111.08", "Total Deposits: RM 44,751.09"]);
    const text = asString(pdf);
    const match = text.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
    expect(match).not.toBeNull();
    const [, declaredLength, streamBody] = match!;
    expect(streamBody.length).toBe(Number(declaredLength));
  });
});
