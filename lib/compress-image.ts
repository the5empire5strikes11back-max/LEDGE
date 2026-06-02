/**
 * Client-side image compression + center-square crop.
 * Uses Canvas API — no external dependencies.
 * Returns a JPEG Blob at the target dimension (default 400×400, quality 0.85).
 */
export async function compressToSquare(file: File, size = 400, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"))
        return
      }

      // Center-crop to square
      const naturalW = img.naturalWidth
      const naturalH = img.naturalHeight
      const minDim = Math.min(naturalW, naturalH)
      const sx = (naturalW - minDim) / 2
      const sy = (naturalH - minDim) / 2

      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error("Canvas toBlob returned null"))
        },
        "image/jpeg",
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Failed to decode image"))
    }

    img.src = objectUrl
  })
}
