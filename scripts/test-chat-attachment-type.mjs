/** Pure logic tests for chat attachment type resolution (no browser / supabase). */

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

function inferTypeFromFilename(name) {
  const n = String(name ?? '');
  if (IMAGE_EXT.test(n)) return 'image';
  if (VIDEO_EXT.test(n)) return 'video';
  return null;
}

function normalizeAttachmentFields(msg) {
  return {
    attachmentType: msg.attachmentType ?? msg.attachment_type,
    attachmentUrl: msg.attachmentUrl ?? msg.attachment_url,
    attachmentName: msg.attachmentName ?? msg.attachment_name,
  };
}

function resolveDisplayAttachmentType(msg) {
  const { attachmentType: stored, attachmentUrl, attachmentName } = normalizeAttachmentFields(msg);
  if (stored === 'video_link') return 'video_link';
  if (!attachmentUrl) return null;
  const pathName = String(attachmentUrl).split('/').pop() ?? '';
  const inferred = inferTypeFromFilename(attachmentName) ?? inferTypeFromFilename(pathName);
  if (stored === 'image' || stored === 'video' || stored === 'file') {
    if (stored === 'file' && inferred) return inferred;
    return stored;
  }
  return inferred ?? 'file';
}

const cases = [
  [{ attachmentType: 'file', attachmentName: 'photo.jpg', attachmentUrl: 'group/x/y/photo.jpg' }, 'image'],
  [{ attachmentType: 'file', attachmentName: 'IMG_1234', attachmentUrl: 'group/x/y/IMG_1234.jpg' }, 'image'],
  [{ attachment_type: 'image', attachment_name: 'x', attachment_url: 'group/x/y/a.jpg' }, 'image'],
  [{ attachmentType: 'file', attachmentName: 'document', attachmentUrl: 'private/u/m/document.pdf' }, 'file'],
  [{ attachmentType: null, attachmentName: null, attachmentUrl: 'group/m/x/shot.png' }, 'image'],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = resolveDisplayAttachmentType(input);
  const ok = got === expected;
  console.log(ok ? 'OK' : 'FAIL', JSON.stringify(input), '=>', got, `(expected ${expected})`);
  if (!ok) failed += 1;
}

process.exit(failed > 0 ? 1 : 0);
