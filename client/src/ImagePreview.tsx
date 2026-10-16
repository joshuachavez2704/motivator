import { useState } from 'react'
import './ImagePreview.css'

type Props = {
  imageUrl: string
}

function ImagePreview({ imageUrl }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <button
      type="button"
      className={open ? 'preview preview-open' : 'preview'}
      onClick={() => setOpen(!open)}
      aria-label={open ? 'Hide puzzle image' : 'Show puzzle image'}
    >
      <img src={imageUrl} alt="The finished puzzle" draggable={false} />
      <span>{open ? 'Click to shrink' : 'Click to enlarge'}</span>
    </button>
  )
}

export default ImagePreview