import { lookup } from "dns/promises";
import { isIP } from "net";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { VideoDigestError } from "@/video/errors";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224
  );
}

export function isPrivateAddress(address: string) {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return isPrivateIpv4(address);
}

async function assertSafeUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", "La imagen debe usar HTTPS y no incluir credenciales.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname === "metadata.google.internal") {
    throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", "El host de la imagen no esta permitido.");
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", "La imagen apunta a una red privada.");
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", "La imagen resuelve a una red no permitida.");
  }
  return url;
}

export async function safeDownloadImage(
  rawUrl: string,
  outputDirectory: string,
  baseName: string,
  signal?: AbortSignal,
  redirectCount = 0
): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
  if (redirectCount > 3) throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", "Demasiadas redirecciones descargando imagen.");
  const url = await assertSafeUrl(rawUrl);
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "User-Agent": "Nuxton-Knowledge-Platform/1.0" },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000)
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", "Redireccion sin destino.");
    return safeDownloadImage(new URL(location, url).toString(), outputDirectory, baseName, signal, redirectCount + 1);
  }
  if (!response.ok) throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", `La imagen devolvio HTTP ${response.status}.`);

  const mimeType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  const extension = ALLOWED_TYPES[mimeType];
  if (!extension) throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", `Tipo de imagen no permitido: ${mimeType || "desconocido"}.`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_IMAGE_BYTES) throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", "La imagen supera 8 MB.");

  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > MAX_IMAGE_BYTES) throw new VideoDigestError("MEDIA_DOWNLOAD_ERROR", "La imagen supera 8 MB.");
  const fileName = `${baseName.replace(/[^a-zA-Z0-9_-]+/g, "-")}${extension}`;
  const absolutePath = path.join(outputDirectory, fileName);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(absolutePath, data);
  return { absolutePath, fileName, mimeType };
}
