import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

// Factories, not pre-built objects: spawn() must construct a fresh child
// (with its own fresh stdin stream) on every call it's mocked to receive,
// the same way the real node:child_process.spawn does. A shared instance
// would have its stdin .end()ed by the first call and then throw
// "write after end" on the second, and its close/error event scheduled via
// setImmediate before the real call site ever attaches a listener for it.
function fakeChild(exitCode: number) {
  return () => {
    const child = new EventEmitter() as EventEmitter & { stdin: PassThrough };
    child.stdin = new PassThrough();
    setImmediate(() => child.emit("close", exitCode));
    return child;
  };
}

function fakeChildThatErrors(err: Error) {
  return () => {
    const child = new EventEmitter() as EventEmitter & { stdin: PassThrough };
    child.stdin = new PassThrough();
    setImmediate(() => child.emit("error", err));
    return child;
  };
}

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform });
}

afterEach(() => {
  setPlatform(originalPlatform);
  vi.clearAllMocks();
});

describe("copyToClipboard", () => {
  it("uses pbcopy on macOS", async () => {
    setPlatform("darwin");
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(fakeChild(0));

    const { copyToClipboard } = await import("./clipboard.js");
    await copyToClipboard("hello");

    expect(spawn).toHaveBeenCalledWith("pbcopy", [], expect.objectContaining({}));
  });

  it("uses clip on Windows", async () => {
    setPlatform("win32");
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(fakeChild(0));

    const { copyToClipboard } = await import("./clipboard.js");
    await copyToClipboard("hello");

    expect(spawn).toHaveBeenCalledWith("clip", [], expect.objectContaining({}));
  });

  it("on Linux, falls through wl-copy -> xclip -> xsel until one succeeds", async () => {
    setPlatform("linux");
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(fakeChildThatErrors(new Error("ENOENT")))
      .mockImplementationOnce(fakeChildThatErrors(new Error("ENOENT")))
      .mockImplementationOnce(fakeChild(0));

    const { copyToClipboard } = await import("./clipboard.js");
    await copyToClipboard("hello");

    expect(spawn).toHaveBeenNthCalledWith(1, "wl-copy", [], expect.objectContaining({}));
    expect(spawn).toHaveBeenNthCalledWith(2, "xclip", ["-selection", "clipboard"], expect.objectContaining({}));
    expect(spawn).toHaveBeenNthCalledWith(3, "xsel", ["--clipboard", "--input"], expect.objectContaining({}));
  });

  it("throws a clear error when no clipboard tool is available on Linux", async () => {
    setPlatform("linux");
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(fakeChildThatErrors(new Error("ENOENT")));

    const { copyToClipboard } = await import("./clipboard.js");
    await expect(copyToClipboard("hello")).rejects.toThrow("No clipboard tool found");
  });

  it("throws when the platform's copy command exits non-zero", async () => {
    setPlatform("darwin");
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(fakeChild(1));

    const { copyToClipboard } = await import("./clipboard.js");
    await expect(copyToClipboard("hello")).rejects.toThrow('"pbcopy" exited with code 1');
  });
});
