import { useEffect, useState } from 'react'
import API from '../services/api'

/**
 * Loads a PRIVATE photo (needs the login token, so a plain <img src> cannot be used)
 * and returns an object URL, or null while loading / if unavailable.
 */
export default function useAuthedImage(url) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!url) { setSrc(null); return undefined }
    let objectUrl = null
    let cancelled = false
    API.get(url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data)
        setSrc(objectUrl)
      })
      .catch(() => { if (!cancelled) setSrc(null) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])
  return src
}
