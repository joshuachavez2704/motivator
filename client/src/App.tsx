import { useState } from 'react'
import type { SubmitEvent } from 'react'
import './App.css'

function App() {
  const [text, setText] = useState('')
  const [tasks, setTasks] = useState<string[]>([])

  function handleSubmit(e: SubmitEvent<HTMLFormElement>){
    e.preventDefault()
    if (!text.trim()) return
    setTasks([...tasks, text])
    setText('')
  }

  return (
    <main> 
      <h1>Habit Puzzle</h1>

      <form onSubmit={handleSubmit}>

        <label htmlFor="task">Task: </label>

        <input
          id="task"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder = "What do you need to do?"
        />

        <button type="submit">Add</button>
      </form>

      <div>
        {tasks.map((task, index) => (
          <p key = {index}>{task}</p>
        ))}
      </div>
    </main>
  )
}

export default App
