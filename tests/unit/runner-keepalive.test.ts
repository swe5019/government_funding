import { afterEach, describe, expect, it, vi } from "vitest";
import { keepAlive } from "@/jobs/runner";

describe("keepAlive", () => {
  afterEach(() => vi.useRealTimers());

  it("pings on an interval, never overlaps pings, and stops", async () => {
    vi.useFakeTimers();
    let resolve: () => void = () => {};
    const query = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const stop = keepAlive({ query } as never, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000); // first ping still pending
    expect(query).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(query).toHaveBeenCalledTimes(2);

    stop();
    resolve();
    await vi.advanceTimersByTimeAsync(5000);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("swallows a failed ping", async () => {
    vi.useFakeTimers();
    const query = vi.fn(() => Promise.reject(new Error("terminating connection")));
    const stop = keepAlive({ query } as never, 1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(query).toHaveBeenCalledTimes(2);
    stop();
  });
});
