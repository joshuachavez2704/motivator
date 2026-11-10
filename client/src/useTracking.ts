import { useEffect, useState } from 'react'
import * as api from './api'
import type { PieceValues, TrackingData } from './api'

// Today's date on the player's own clock, like "2026-11-10"
export function localDay(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

// Habits, to-dos and piece values for today, kept in sync with the server.
// Every change goes to the server first; the screen updates from its answer.
export function useTracking() {
  const [day, setDay] = useState(() => localDay())
  const [data, setData] = useState<TrackingData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // load today's data (and load again if the day changes)
  useEffect(() => {
    api
      .loadTracking(day)
      .then((loaded) => {
        setData(loaded)
        setError(null)
      })
      .catch((err) => setError(messageOf(err)))
  }, [day])

  // if the page stays open past midnight, switch to the new day when you come back to it
  useEffect(() => {
    function checkDay() {
      setDay(localDay())
    }
    window.addEventListener('focus', checkDay)
    document.addEventListener('visibilitychange', checkDay)
    return () => {
      window.removeEventListener('focus', checkDay)
      document.removeEventListener('visibilitychange', checkDay)
    }
  }, [])

  // runs one change; a failure becomes a message instead of a crash
  async function run(job: () => Promise<void>, undo?: () => void) {
    try {
      await job()
      setError(null)
    } catch (err) {
      undo?.()
      setError(messageOf(err))
    }
  }

  const addHabit = (name: string) =>
    run(async () => {
      const habit = await api.createHabit(name)
      setData((prev) => prev && { ...prev, habits: [...prev.habits, habit] })
    })

  const removeHabit = (id: number) =>
    run(async () => {
      await api.deleteHabit(id)
      setData((prev) => prev && { ...prev, habits: prev.habits.filter((h) => h.id !== id) })
    })

  // a checkbox should react the moment you click it, so the tick shows right away
  // and is only undone if the server says no
  const setHabitTick = (id: number, done: boolean) =>
    setData((prev) => prev && { ...prev, habits: prev.habits.map((h) => (h.id === id ? { ...h, done } : h)) })

  const toggleHabit = (id: number, done: boolean) => {
    setHabitTick(id, done)
    return run(
      async () => {
        const earned = await api.setHabitDone(id, day, done)
        setData((prev) => prev && { ...prev, ...earned })
      },
      () => setHabitTick(id, !done),
    )
  }

  const addTodo = (text: string) =>
    run(async () => {
      const todo = await api.createTodo(day, text)
      setData((prev) => prev && { ...prev, todos: [...prev.todos, todo] })
    })

  // done / focus / text changes all come back as the updated to-do plus the new totals
  const setTodoTick = (id: number, done: boolean) =>
    setData((prev) => prev && { ...prev, todos: prev.todos.map((t) => (t.id === id ? { ...t, done } : t)) })

  const changeTodo = (id: number, change: { done?: boolean; text?: string; focus?: boolean }) => {
    // ticking is instant, like a habit; the other changes wait for the server
    const { done } = change
    if (done !== undefined) setTodoTick(id, done)

    return run(
      async () => {
        const { todo, ...earned } = await api.updateTodo(id, change)
        setData((prev) => {
          if (!prev) return prev
          const others = prev.todos
            .filter((t) => t.id !== id)
            // only one to-do can be "your one thing"
            .map((t) => (todo.focus ? { ...t, focus: false } : t))
          const todos = [...others, todo].sort(
            (a, b) => Number(b.focus) - Number(a.focus) || a.id - b.id,
          )
          return { ...prev, ...earned, todos }
        })
      },
      done === undefined ? undefined : () => setTodoTick(id, !done),
    )
  }

  const removeTodo = (id: number) =>
    run(async () => {
      const earned = await api.deleteTodo(id)
      setData((prev) => prev && { ...prev, ...earned, todos: prev.todos.filter((t) => t.id !== id) })
    })

  const saveSettings = (values: PieceValues) =>
    run(async () => {
      const settings = await api.saveSettings(values)
      setData((prev) => prev && { ...prev, settings })
    })

  return {
    data,
    error,
    addHabit,
    removeHabit,
    toggleHabit,
    addTodo,
    changeTodo,
    removeTodo,
    saveSettings,
  }
}

export type Tracking = ReturnType<typeof useTracking>