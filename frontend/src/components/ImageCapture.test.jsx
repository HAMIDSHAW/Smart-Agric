import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../utils/imageQuality', () => ({
  processLeafImage: vi.fn(async (file) => ({ blob: file, dataUrl: 'data:', quality: { isDark: false, isBlurry: false } })),
}))
import { processLeafImage } from '../utils/imageQuality'
import ImageCapture from './ImageCapture'

function Harness({ multiple = false, maxImages = 1, spy }) {
  const [images, setImages] = useState([])
  return <ImageCapture images={images} multiple={multiple} maxImages={maxImages}
    onChange={(n) => { spy?.(n); setImages(n) }} />
}

const jpg = (name = 'leaf.jpg', size = 2000) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' })
const pick = (file, testid = 'gallery-input') =>
  fireEvent.change(screen.getByTestId(testid), { target: { files: [file] } })

beforeEach(() => {
  processLeafImage.mockClear()
  processLeafImage.mockImplementation(async (file) => ({ blob: file, dataUrl: 'data:', quality: { isDark: false, isBlurry: false } }))
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
})

describe('gallery upload', () => {
  it('adds a valid photo with a preview', async () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    pick(jpg())
    expect(await screen.findByRole('img', { name: /preview of leaf\.jpg/i })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0][0]).toMatchObject({ name: 'leaf.jpg', source: 'gallery' })
  })

  it('rejects unsupported and empty files with a visible reason', async () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    pick(new File(['x'], 'doc.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/only jpeg, png or webp/i)
    pick(new File([], 'empty.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/empty/i))
    expect(spy).not.toHaveBeenCalled()
  })

  it('explains HEIC photos', async () => {
    render(<Harness />)
    pick(new File(['x'], 'IMG.heic', { type: 'image/heic' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/HEIC/)
  })

  it('shows quality warnings but still keeps the photo', async () => {
    processLeafImage.mockImplementationOnce(async (file) => ({ blob: file, quality: { isDark: true, isBlurry: true } }))
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    pick(jpg())
    expect(await screen.findByText(/photo is dark/i)).toBeInTheDocument()
    expect(screen.getByText(/may be blurry/i)).toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
  })

  it('does not block the farmer when compression fails; flags it as unchecked', async () => {
    processLeafImage.mockRejectedValueOnce(new Error('canvas failed'))
    render(<Harness />)
    pick(jpg())
    expect(await screen.findByText(/could not check this photo/i)).toBeInTheDocument()
  })

  it('removes a photo and replaces it in single mode', async () => {
    render(<Harness />)
    pick(jpg('one.jpg'))
    await screen.findByRole('img', { name: /one\.jpg/ })
    pick(jpg('two.jpg'))
    await screen.findByRole('img', { name: /two\.jpg/ })
    expect(screen.queryByRole('img', { name: /one\.jpg/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /remove photo two\.jpg/i }))
    expect(screen.queryByRole('img', { name: /two\.jpg/ })).toBeNull()
  })

  it('supports several photos up to the limit', async () => {
    render(<Harness multiple maxImages={2} />)
    fireEvent.change(screen.getByTestId('gallery-input'), { target: { files: [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')] } })
    await screen.findByRole('img', { name: /a\.jpg/ })
    expect(screen.getByRole('img', { name: /b\.jpg/ })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /c\.jpg/ })).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(/up to 2 photos/i)
  })
})

describe('camera', () => {
  const makeStream = ({ torch = false } = {}) => {
    const track = { stop: vi.fn(), getCapabilities: () => (torch ? { torch: true } : {}), applyConstraints: vi.fn().mockResolvedValue() }
    return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } }
  }
  const installCamera = ({ stream, devices = [{ kind: 'videoinput' }], reject } = {}) => {
    const getUserMedia = reject ? vi.fn().mockRejectedValue(reject) : vi.fn().mockResolvedValue(stream)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue(devices) },
    })
    return getUserMedia
  }
  const stubVideoAndCanvas = () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob([new Uint8Array(500)], { type: 'image/jpeg' })))
  }

  it('asks permission with an explanation first, then requests the rear camera without audio', async () => {
    const { stream } = makeStream()
    const gum = installCamera({ stream })
    stubVideoAndCanvas()
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/needs your camera only to take photos/i)).toBeInTheDocument()
    expect(gum).not.toHaveBeenCalled()                       // nothing requested until the farmer agrees
    await userEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    await waitFor(() => expect(gum).toHaveBeenCalled())
    const constraints = gum.mock.calls[0][0]
    expect(constraints.audio).toBe(false)
    expect(constraints.video.facingMode).toEqual({ ideal: 'environment' })
  })

  it('captures, previews, retakes and submits; stops the stream after capture and on close', async () => {
    const { stream, track } = makeStream()
    installCamera({ stream }); stubVideoAndCanvas()
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    await userEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    await userEvent.click(await screen.findByRole('button', { name: /take picture/i }))
    expect(await screen.findByRole('img', { name: /photo you just took/i })).toBeInTheDocument()
    expect(track.stop).toHaveBeenCalled()                    // camera light off during review

    await userEvent.click(screen.getByRole('button', { name: /^retake$/i }))           // retake restarts the stream
    await userEvent.click(await screen.findByRole('button', { name: /take picture/i }))
    await userEvent.click(await screen.findByRole('button', { name: /use this photo/i }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0][0][0]).toMatchObject({ source: 'camera' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stops the stream when the camera is closed or the page unmounts', async () => {
    const a = makeStream(); installCamera({ stream: a.stream }); stubVideoAndCanvas()
    const first = render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    await userEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    await screen.findByRole('button', { name: /take picture/i })
    await userEvent.click(screen.getByRole('button', { name: /close camera/i }))
    expect(a.track.stop).toHaveBeenCalled()
    first.unmount()

    const b = makeStream(); installCamera({ stream: b.stream })
    const second = render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    await userEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    await screen.findByRole('button', { name: /take picture/i })
    expect(b.track.stop).not.toHaveBeenCalled()      // still live while the farmer is framing the shot
    second.unmount()
    expect(b.track.stop).toHaveBeenCalled()         // leaving the page always releases the camera
  })

  it('closes with Escape and when the tab is hidden', async () => {
    const a = makeStream(); installCamera({ stream: a.stream }); stubVideoAndCanvas()
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    await userEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    await screen.findByRole('button', { name: /take picture/i })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(a.track.stop).toHaveBeenCalled()
  })

  it('handles permission denial with a helpful message and fallbacks', async () => {
    installCamera({ reject: Object.assign(new Error('denied'), { name: 'NotAllowedError' }) })
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    await userEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission was blocked/i)
    expect(screen.getByRole('button', { name: /phone camera app/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('reports a missing camera', async () => {
    installCamera({ reject: Object.assign(new Error('none'), { name: 'NotFoundError' }) })
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    await userEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no camera was found/i)
  })

  it('shows torch only when the device supports it, and switch only with two cameras', async () => {
    const withTorch = makeStream({ torch: true })
    installCamera({ stream: withTorch.stream, devices: [{ kind: 'videoinput' }, { kind: 'videoinput' }] })
    stubVideoAndCanvas()
    const r1 = render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    await userEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    expect(await screen.findByRole('button', { name: /light on/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /switch camera/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /light on/i }))
    expect(withTorch.track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
    r1.unmount()

    const plain = makeStream()
    installCamera({ stream: plain.stream })
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    await userEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    await screen.findByRole('button', { name: /take picture/i })
    expect(screen.queryByRole('button', { name: /light on/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /switch camera/i })).toBeNull()
  })

  it('falls back to the phone camera app when getUserMedia is unavailable', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    render(<Harness />)
    expect(screen.getByTestId('native-camera-input')).toHaveAttribute('capture', 'environment')
    await userEvent.click(screen.getByRole('button', { name: /take photo/i }))
    expect(click).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    // a photo from the phone's camera app goes through the same validation/processing
    pick(jpg('native.jpg'), 'native-camera-input')
    expect(await screen.findByRole('img', { name: /native\.jpg/ })).toBeInTheDocument()
  })
})
