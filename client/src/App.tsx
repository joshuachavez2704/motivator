import { useState } from 'react'
import type { SubmitEvent } from 'react'
import './App.css'

type Task = {
  id: number
  text: string
  weight: number
  done: boolean
}

function App() {
  const [text, setText] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [weight, setWeight] = useState(1)

  const completedWeight = tasks.filter((task) => task.done).reduce((sum, task) => sum + task.weight, 0)

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!text.trim()) return
    setTasks([...tasks, { id: Date.now(), text, weight, done: false}])
    setText('')
  }

  function removeTask(id: number) {
    setTasks(tasks.filter((task) => task.id !== id))
  }

  function toggleTask(id: number){
    setTasks(tasks.map((task) => task.id === id ? { ...task, done: !task.done} : task))
  }

  return (
    <main>
      <h1>Habit Puzzle</h1>
      <p>Completed Weight Today: {completedWeight}</p>

      <form onSubmit={handleSubmit}>

        <label htmlFor="task">Task: </label>

        <input
          id="task"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you need to do?"
        />
        <select value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
          <option value={1}>1 - Light</option>
          <option value={2}>2</option>
          <option value={3}>3 - Medium</option>
          <option value={4}>4</option>
          <option value={5}>5 - Heavy</option>
        </select>

        <button type="submit">Add</button>
      </form>

      <div>
        {tasks.map((task) => (
          <div key={task.id}>
            <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)}></input>
            <span>{task.text} (weight {task.weight})</span>
            <button onClick={() => removeTask(task.id)}>Remove</button>
          </div>
        ))}
      </div>


    </main>
  )
}

export default App
