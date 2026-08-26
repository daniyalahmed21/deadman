import { describe, it, expect, afterEach } from "vitest";
import { demoMode } from "../src/config.js";

const orig = process.env.DEADMAN_DEMO_MODE;
afterEach(() => {
  if (orig === undefined) delete process.env.DEADMAN_DEMO_MODE;
  else process.env.DEADMAN_DEMO_MODE = orig;
});

describe("demo mode flag", () => {
  it("is off by default", () => {
    delete process.env.DEADMAN_DEMO_MODE;
    expect(demoMode()).toBe(false);
  });
  it("accepts common truthy values", () => {
    for (const v of ["1", "on", "true", "YES"]) {
      process.env.DEADMAN_DEMO_MODE = v;
      expect(demoMode(), v).toBe(true);
    }
  });
  it("rejects other values", () => {
    process.env.DEADMAN_DEMO_MODE = "off";
    expect(demoMode()).toBe(false);
  });
});
