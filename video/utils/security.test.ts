import path from "path";
import { describe, expect, it } from "vitest";
import { LocalVideoStorageProvider } from "@/video/services/video-storage-service";
import { isPrivateAddress } from "@/video/utils/safe-media-download";

describe("video media security", () => {
  it.each(["127.0.0.1", "10.0.0.8", "172.16.4.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "fe80::1"])(
    "blocks private address %s",
    (address) => expect(isPrivateAddress(address)).toBe(true)
  );

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it("rejects storage path traversal", async () => {
    const storage = new LocalVideoStorageProvider(path.resolve(process.cwd(), "data/video-digests-test"));
    await expect(storage.open("digest/../../.env")).rejects.toThrow(/Clave de almacenamiento/);
  });

  it("rejects malformed digest IDs", async () => {
    const storage = new LocalVideoStorageProvider(path.resolve(process.cwd(), "data/video-digests-test"));
    await expect(storage.workspace("../escape")).rejects.toThrow(/Identificador de video/);
  });
});
