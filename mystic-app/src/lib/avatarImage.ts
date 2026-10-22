const MAX_DIMENSION = 400;
const MAX_AVATAR_BYTES = 200 * 1024;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That image could not be read. Please choose a different photo."));
    };
    image.src = objectUrl;
  });

const dataUrlBytes = (dataUrl: string) => Math.ceil(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

// Resizes to a square-bounded JPEG data URL under ~200 KB so it fits in the Firestore user document.
export async function createAvatarDataUrl(file: File): Promise<string> {
  const image = await loadImage(file);
  let scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));

  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process this image.");
    context.fillStyle = "#070412";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlBytes(dataUrl) <= MAX_AVATAR_BYTES) return dataUrl;
    }
    scale *= 0.75;
  }
  throw new Error("This photo is too detailed to shrink to an avatar. Please choose a different photo.");
}

// Small square thumbnail for public Live session metadata; the full profile photo stays private to the user doc.
export async function createLiveAvatarThumbnail(source: string): Promise<string> {
  if (!source.startsWith("data:image/")) return source.length <= 2000 ? source : "";
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Avatar could not be read."));
    element.src = source;
  });
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const crop = Math.min(image.width, image.height);
  context.drawImage(image, (image.width - crop) / 2, (image.height - crop) / 2, crop, crop, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.7);
}
