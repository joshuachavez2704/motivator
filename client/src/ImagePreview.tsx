import { useRef } from 'react'
import './ImagePreview.css'

type Props = {
  imageUrl: string
}

// A small picture of the finished puzzle. Click it to see it large; click anywhere or press Escape to close.
function ImagePreview({ imageUrl }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)

  if (!imageUrl) return null

  return (
    <>
      <button type="button" className="preview" onClick={() => dialog.current?.showModal()} aria-label="Show puzzle image larger">
        <img src={imageUrl} alt="The finished puzzle" draggable={false} />
        <span>Click to enlarge</span>
      </button>
      <dialog ref={dialog} className="preview-dialog" aria-label="The finished puzzle" onClick={() => dialog.current?.close()}>
        <img src={imageUrl} alt="The finished puzzle, large" />
      </dialog>
    </>
  )
}

export default ImagePreview
