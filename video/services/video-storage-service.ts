import { copyFile, mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { SettingsService } from "@/lib/services/settings-service";
import { VideoDigestError } from "@/video/errors";

export interface VideoStorageProvider {
  save(storageKey: string, value: Buffer | string): Promise<void>;
  open(storageKey: string): Promise<{ absolutePath: string; size: number }>;
  exists(storageKey: string): Promise<boolean>;
  delete(storageKey: string): Promise<void>;
  getMetadata(storageKey: string): Promise<{ size: number; updatedAt: Date }>;
}

function assertDigestId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new VideoDigestError("VIDEO_DIGEST_INTEGRITY_ERROR", "Identificador de video no valido.");
  }
}

export class LocalVideoStorageProvider implements VideoStorageProvider {
  constructor(private readonly baseDirectory: string) {}

  static async create() {
    const settings = await SettingsService.getAll();
    const workspaceRoot = path.resolve(process.cwd());
    const baseDirectory = path.resolve(workspaceRoot, settings.video.outputDirectory);
    if (!baseDirectory.startsWith(`${workspaceRoot}${path.sep}`) || baseDirectory.startsWith(path.join(workspaceRoot, "public"))) {
      throw new VideoDigestError(
        "VIDEO_DIGEST_INTEGRITY_ERROR",
        "El directorio de videos debe ser una ruta relativa dentro del proyecto y fuera de public."
      );
    }
    await mkdir(baseDirectory, { recursive: true });
    return new LocalVideoStorageProvider(baseDirectory);
  }

  private resolveKey(storageKey: string) {
    if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+$/.test(storageKey) || storageKey.includes("..")) {
      throw new VideoDigestError("VIDEO_DIGEST_INTEGRITY_ERROR", "Clave de almacenamiento no valida.");
    }
    const absolutePath = path.resolve(this.baseDirectory, storageKey);
    if (!absolutePath.startsWith(`${this.baseDirectory}${path.sep}`)) {
      throw new VideoDigestError("VIDEO_DIGEST_INTEGRITY_ERROR", "La clave sale del directorio de videos.");
    }
    return absolutePath;
  }

  async save(storageKey: string, value: Buffer | string) {
    const target = this.resolveKey(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    if (typeof value === "string") await copyFile(value, target);
    else await writeFile(target, value);
  }

  async open(storageKey: string) {
    const absolutePath = this.resolveKey(storageKey);
    try {
      const metadata = await stat(absolutePath);
      if (!metadata.isFile()) throw new Error("Not a file");
      return { absolutePath, size: metadata.size };
    } catch (error) {
      throw new VideoDigestError("VIDEO_FILE_NOT_FOUND", "El archivo de video no existe en el almacenamiento.", {
        cause: error
      });
    }
  }

  async exists(storageKey: string) {
    try {
      const metadata = await stat(this.resolveKey(storageKey));
      return metadata.isFile();
    } catch {
      return false;
    }
  }

  async delete(storageKey: string) {
    await rm(this.resolveKey(storageKey), { force: true });
  }

  async getMetadata(storageKey: string) {
    const metadata = await stat(this.resolveKey(storageKey));
    return { size: metadata.size, updatedAt: metadata.mtime };
  }

  async workspace(videoDigestId: string) {
    assertDigestId(videoDigestId);
    const directory = path.join(this.baseDirectory, videoDigestId);
    const tempDirectory = path.join(directory, "temp");
    const publicDirectory = path.join(tempDirectory, "public");
    await mkdir(publicDirectory, { recursive: true });
    return {
      directory,
      tempDirectory,
      publicDirectory,
      bundleDirectory: path.join(tempDirectory, "bundle"),
      videoPath: path.join(directory, "video.mp4"),
      thumbnailPath: path.join(directory, "thumbnail.jpg"),
      subtitlePath: path.join(directory, "captions.srt"),
      manifestPath: path.join(directory, "manifest.json"),
      videoKey: `${videoDigestId}/video.mp4`,
      thumbnailKey: `${videoDigestId}/thumbnail.jpg`,
      subtitleKey: `${videoDigestId}/captions.srt`,
      manifestKey: `${videoDigestId}/manifest.json`
    };
  }

  async writeJson(storageKey: string, value: unknown) {
    await this.save(storageKey, Buffer.from(JSON.stringify(value, null, 2), "utf8"));
  }

  async readJson<T>(storageKey: string) {
    return JSON.parse(await readFile(this.resolveKey(storageKey), "utf8")) as T;
  }

  async cleanupTemp(videoDigestId: string) {
    assertDigestId(videoDigestId);
    await rm(path.join(this.baseDirectory, videoDigestId, "temp"), { recursive: true, force: true });
  }

  async deleteDigestFiles(videoDigestId: string) {
    assertDigestId(videoDigestId);
    await rm(path.join(this.baseDirectory, videoDigestId), { recursive: true, force: true });
  }
}
