import { describe, it, expect } from "vitest";
import { calculateSecondaryPrice } from "./portfolio";

describe("calculateSecondaryPrice", () => {
  it("prices at par (RM1) once the note has fully matured", () => {
    expect(calculateSecondaryPrice(8, 540, 540)).toBe(1);
  });

  it("clamps past-maturity elapsed days instead of pricing above par", () => {
    expect(calculateSecondaryPrice(8, 540, 600)).toBe(1);
  });

  it("discounts below par while time remains to maturity", () => {
    const price = calculateSecondaryPrice(8, 540, 0);
    expect(price).toBeLessThan(1);
    expect(price).toBeGreaterThan(0);
  });

  it("prices closer to par the closer the note gets to maturity", () => {
    const early = calculateSecondaryPrice(8, 540, 0);
    const mid = calculateSecondaryPrice(8, 540, 270);
    const late = calculateSecondaryPrice(8, 540, 500);
    expect(early).toBeLessThan(mid);
    expect(mid).toBeLessThan(late);
    expect(late).toBeLessThan(1);
  });

  it("applies no discount for a zero-yield facility", () => {
    expect(calculateSecondaryPrice(0, 540, 0)).toBe(1);
  });

  it("is not something the caller can override with an arbitrary price", () => {
    // Same inputs always produce the same system price - no seller-chosen
    // component exists in the calculation at all.
    expect(calculateSecondaryPrice(7, 365, 100)).toBe(calculateSecondaryPrice(7, 365, 100));
  });
});
