import io
from PIL import Image


class FakeResp:
    def __init__(self, status=200, body=None, headers=None, text=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}
        self.text = text if text is not None else str(body)

    def json(self):
        if self._body is None:
            raise ValueError('no json')
        return self._body


def groq_ok(text):
    return FakeResp(200, {'choices': [{'message': {'content': text}}]})


def img_bytes(fmt='JPEG', size=(480, 480), noisy=True, color=(120, 140, 90), mode='RGB'):
    if noisy:
        base = Image.effect_noise(size, 70).convert('RGB')
        tint = Image.new('RGB', size, color)
        im = Image.blend(base, tint, 0.35)
    else:
        im = Image.new('RGB', size, color)
    if mode == 'RGBA':
        im = im.convert('RGBA')
    buf = io.BytesIO()
    im.save(buf, fmt)
    return buf.getvalue()


VISION_JSON = ('{"image_quality":"good","is_healthy":false,"diagnosis_type":"disease",'
               '"disease_name":"Cassava Mosaic","confidence":88,"pathogen":"CMV","causes":["whitefly"],'
               '"treatment":["remove plants"],"prevention":["clean cuttings"],"severity":"medium"}')
