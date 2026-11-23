/**
 * Strips EXIF metadata (APP1 marker 0xFFE1) from JPEG byte arrays client-side
 * before file encryption and transmission.
 */
export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    // Not a JPEG image, return unaltered
    return bytes;
  }

  const resultSegments: Uint8Array[] = [];
  // Preserve SOI (0xFFD8)
  resultSegments.push(new Uint8Array([0xff, 0xd8]));

  let offset = 2;
  let hasExifStripped = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Stream desynchronization or start of scan raw data; copy remainder
      resultSegments.push(bytes.subarray(offset));
      break;
    }

    const marker = bytes[offset + 1];

    // SOS (Start of Scan 0xFFDA) or EOI (End of Image 0xFFD9) marks the end of metadata headers
    if (marker === 0xda || marker === 0xd9) {
      resultSegments.push(bytes.subarray(offset));
      break;
    }

    // Standalone markers without length: RST0-RST7, TEM
    if (marker === 0x01 || (marker! >= 0xd0 && marker! <= 0xd7)) {
      resultSegments.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > bytes.length) {
      resultSegments.push(bytes.subarray(offset));
      break;
    }

    // Read 2-byte segment length (includes length bytes themselves)
    const segmentLength = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const segmentEnd = offset + 2 + segmentLength;

    if (segmentEnd > bytes.length) {
      resultSegments.push(bytes.subarray(offset));
      break;
    }

    // Marker 0xE1 is APP1 (EXIF / XMP metadata)
    if (marker === 0xe1) {
      hasExifStripped = true;
      // Skip this segment entirely!
      offset = segmentEnd;
      continue;
    }

    // Keep other valid segments (e.g. APP0 JFIF, DQT, DHT, SOF)
    resultSegments.push(bytes.subarray(offset, segmentEnd));
    offset = segmentEnd;
  }

  if (!hasExifStripped) {
    return bytes;
  }

  // Concatenate cleaned segments
  const totalLen = resultSegments.reduce((sum, seg) => sum + seg.length, 0);
  const cleaned = new Uint8Array(totalLen);
  let writeOffset = 0;
  for (const seg of resultSegments) {
    cleaned.set(seg, writeOffset);
    writeOffset += seg.length;
  }

  return cleaned;
}

/**
 * Creates a valid synthetic minimal JPEG byte stream for unit testing,
 * optionally including an APP1 Exif segment with GPS and camera metadata tags.
 */
export function createSyntheticJpeg(includeExif: boolean): Uint8Array {
  const parts: Uint8Array[] = [];

  // 1. SOI
  parts.push(new Uint8Array([0xff, 0xd8]));

  // 2. APP0 (JFIF standard marker)
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
    0x00, 0x00,
  ]);
  parts.push(app0);

  // 3. Optional APP1 (EXIF with simulated GPS / camera metadata)
  if (includeExif) {
    const exifPayload = new TextEncoder().encode('Exif\0\0CAMERA:SonyA7IV_GPS:37.7749,-122.4194');
    const segLen = exifPayload.length + 2;
    const app1Header = new Uint8Array([0xff, 0xe1, (segLen >> 8) & 0xff, segLen & 0xff]);
    parts.push(app1Header);
    parts.push(exifPayload);
  }

  // 4. DQT (Quantization Table)
  parts.push(new Uint8Array([0xff, 0xdb, 0x00, 0x43, 0x00, ...new Array(64).fill(1)]));

  // 5. SOF0 (Start of Frame)
  parts.push(
    new Uint8Array([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00]),
  );

  // 6. SOS (Start of Scan) & minimal compressed data
  parts.push(new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f]));

  // 7. EOI (End of Image)
  parts.push(new Uint8Array([0xff, 0xd9]));

  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
