"""
Server-side image validation, normalisation and quality assessment.

- Validates real file CONTENT (not extension / client content-type).
- Corrects EXIF orientation, converts to RGB, bounds the size, re-encodes as JPEG.
- Applies NO colour/contrast/sharpness changes: only orientation + downscale, so
  disease symptoms are not distorted.
- Quality problems are WARNINGS with farmer-friendly advice; only genuinely
  unusable files (corrupt, unsupported, absurd size) are rejected, with a reason.
- The caller keeps the original bytes for expert review.
"""
import io
from dataclasses import dataclass, field

from PIL import Image, ImageFilter, ImageOps, ImageStat, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 60_000_000

ALLOWED_FORMATS = {'JPEG': ('image/jpeg', 'jpg'), 'PNG': ('image/png', 'png'), 'WEBP': ('image/webp', 'webp')}
MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_SIDE = 1600
MIN_USABLE_SIDE = 64
SMALL_SIDE = 320


class ImageRejected(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class ProcessedImage:
    original_bytes: bytes
    original_ext: str
    jpeg_bytes: bytes
    width: int
    height: int
    original_width: int
    original_height: int
    warnings: list = field(default_factory=list)   # [{'code','message'}]
    metrics: dict = field(default_factory=dict)

    @property
    def content_type(self):
        return 'image/jpeg'


def _warn(code, message):
    return {'code': code, 'message': message}


def assess_quality(img):
    """Cheap, forgiving heuristics on a downsized grayscale copy."""
    g = ImageOps.grayscale(img)
    g.thumbnail((320, 320))
    mean = ImageStat.Stat(g).mean[0]
    hist = g.histogram()
    total = float(sum(hist)) or 1.0
    bright_frac = sum(hist[250:]) / total
    dark_frac = sum(hist[:12]) / total
    lap = g.filter(ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=128))
    # Pillow leaves the 1px border unfiltered; exclude it so flat photos aren't mis-measured.
    w, h = lap.size
    sharp = ImageStat.Stat(lap.crop((1, 1, w - 1, h - 1))).var[0]
    return {'brightness': round(mean, 1), 'sharpness': round(sharp, 1),
            'overexposed_fraction': round(bright_frac, 3), 'underexposed_fraction': round(dark_frac, 3)}


def process_image(raw, *, max_bytes=MAX_UPLOAD_BYTES):
    if not raw:
        raise ImageRejected('empty_file', 'The file is empty. Please choose or capture a photo again.')
    if len(raw) > max_bytes:
        raise ImageRejected('too_large', f'The photo is larger than {max_bytes // (1024 * 1024)} MB. Please use a smaller photo.')
    try:
        probe = Image.open(io.BytesIO(raw))
        fmt = probe.format
        probe.verify()                       # structural check
    except Image.DecompressionBombError:
        raise ImageRejected('too_large', 'This image has too many pixels to process safely.')
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ImageRejected('not_an_image', 'This file is not a valid photo (JPEG, PNG or WebP).')
    if fmt not in ALLOWED_FORMATS:
        raise ImageRejected('unsupported_format', 'Unsupported image type. Please use JPEG, PNG or WebP.')
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Image.DecompressionBombError:
        raise ImageRejected('too_large', 'This image has too many pixels to process safely.')
    except (OSError, SyntaxError, ValueError):
        raise ImageRejected('corrupt', 'The photo appears damaged. Please take it again.')

    ow, oh = img.size
    img = ImageOps.exif_transpose(img)
    if img.mode in ('RGBA', 'LA', 'P'):
        rgba = img.convert('RGBA')
        bg = Image.new('RGB', rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[3])
        img = bg
    else:
        img = img.convert('RGB')

    if min(img.size) < MIN_USABLE_SIDE:
        raise ImageRejected('too_small', 'The photo is too small to analyse. Move closer and take it again.')

    warnings = []
    if min(img.size) < SMALL_SIDE:
        warnings.append(_warn('low_resolution', 'The photo is small. Move closer to the affected leaf so it fills the frame.'))
    m = assess_quality(img)
    if m['brightness'] < 45 or m['underexposed_fraction'] > 0.5:
        warnings.append(_warn('too_dark', 'The photo is very dark. Make sure the plant is well lit, ideally in daylight.'))
    if m['brightness'] > 215 or m['overexposed_fraction'] > 0.35:
        warnings.append(_warn('overexposed', 'The photo is too bright or has strong glare. Move into shade or tilt the leaf.'))
    if m['sharpness'] < 15:
        warnings.append(_warn('blurry', 'The photo may be blurry. Keep the camera steady and tap the leaf to focus.'))

    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=90, optimize=True)
    return ProcessedImage(original_bytes=raw, original_ext=ALLOWED_FORMATS[fmt][1],
                          jpeg_bytes=buf.getvalue(), width=img.size[0], height=img.size[1],
                          original_width=ow, original_height=oh, warnings=warnings, metrics=m)


def to_small_png(jpeg_or_raw_bytes, side=256):
    """Lossless PNG of real decoded pixels (used so the soil colour engine sees true RGB)."""
    img = Image.open(io.BytesIO(jpeg_or_raw_bytes)).convert('RGB')
    img.thumbnail((side, side))
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return buf.getvalue()
