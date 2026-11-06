import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))
vi.mock('../utils/imageQuality', () => ({
  processLeafImage: vi.fn(async (file) => ({ blob: file, quality: { isDark: false, isBlurry: false } })),
}))
import axios from 'axios'
import QuickScan from './QuickScan'

const upload = () => fireEvent.change(screen.getByTestId('gallery-input'), {
  target: { files: [new File([new Uint8Array(500)], 'leaf.jpg', { type: 'image/jpeg' })] },
})
const renderPage = () => render(<MemoryRouter><QuickScan /></MemoryRouter>)

beforeEach(() => axios.post.mockReset())

describe('QuickScan + shared camera/gallery component', () => {
  it('sends the chosen photo to the real public-detect endpoint and shows the real model result', async () => {
    axios.post.mockResolvedValue({ data: {
      image_analyzed: true, is_healthy: false, disease_name: 'Cassava Mosaic', confidence: 88,
      image_quality: 'good', severity: 'medium', treatment: ['Remove plants'], full_results_locked: true } })
    renderPage()
    upload()
    await screen.findByRole('img', { name: /preview of leaf\.jpg/i })
    await userEvent.click(screen.getByRole('button', { name: /detect disease/i }))
    await waitFor(() => expect(axios.post).toHaveBeenCalled())
    const [url, body] = axios.post.mock.calls[0]
    expect(url).toMatch(/\/api\/disease\/public-detect$/)
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('image')).toBeInstanceOf(Blob)
    expect(await screen.findByText(/Cassava Mosaic/)).toBeInTheDocument()
  })

  it('shows an honest message when the photo could not be analysed (never a diagnosis)', async () => {
    axios.post.mockResolvedValue({ data: {
      image_analyzed: false, analysis_type: 'general_guidance', is_healthy: false, confidence: 0,
      disease_name: 'No diagnosis: general guidance for cassava', image_quality: 'poor',
      quality_message: 'Your photo could NOT be analysed, so this is NOT a diagnosis.', treatment: [] } })
    renderPage()
    upload()
    await screen.findByRole('img', { name: /preview of leaf\.jpg/i })
    await userEvent.click(screen.getByRole('button', { name: /detect disease/i }))
    expect(await screen.findByText(/Photo was not analysed/i)).toBeInTheDocument()
    expect(screen.getByText(/NOT be analysed/)).toBeInTheDocument()
    expect(screen.queryByText(/Disease Detected/)).toBeNull()
  })

  it('shows the server error when analysis fails', async () => {
    axios.post.mockRejectedValue({ response: { data: { error: 'We could not analyse this photo.' } } })
    renderPage()
    upload()
    await screen.findByRole('img', { name: /preview of leaf\.jpg/i })
    await userEvent.click(screen.getByRole('button', { name: /detect disease/i }))
    await waitFor(() => expect(axios.post).toHaveBeenCalled())
    expect(screen.queryByText(/Disease Detected/)).toBeNull()
  })

  it('does not call the AI without a photo', async () => {
    renderPage()
    const btn = screen.getByRole('button', { name: /detect disease/i })
    await userEvent.click(btn)
    expect(axios.post).not.toHaveBeenCalled()
  })
})
