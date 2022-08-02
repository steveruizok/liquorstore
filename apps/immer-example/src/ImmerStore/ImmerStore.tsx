import React, { useSyncExternalStore } from "react"
import {
  produce,
  enablePatches,
  applyPatches,
  Patch,
  PatchListener,
} from "immer"

enablePatches()

export class ImmerStore<T extends Record<string, any>> {
  constructor(initial: T) {
    this.prev = initial
    this.current = initial
  }

  private prev: T
  private current: T

  willChange = () => {
    if (this.isPaused) {
      if (!this.didChangeWhilePaused) {
        this.didChangeWhilePaused = true
      }
    }

    this.prev = this.current
  }

  didChange: PatchListener = (patches, inversePatches) => {
    if (!this.isPaused) {
      // Commit an entry to the history
      this.history = this.history.splice(0, this.pointer + 1)
      this.history.push([inversePatches, patches])
      this.pointer++
    } else {
      this.pausedHistory[0].push(...inversePatches)
      this.pausedHistory[1].push(...patches)
    }

    this.notifySubscribers()
  }

  mutate = (fn: (state: T) => void) => {
    this.willChange()
    this.current = produce(this.current, fn, this.didChange)
  }

  // History

  pointer = -1
  history: Patch[][][] = []

  pausedHistory: Patch[][] = [[], []]

  isPaused = false

  didChangeWhilePaused = false

  get state() {
    return this.current
  }

  get canUndo() {
    return (
      this.pointer >= 0 ||
      (this.pointer === 0 && this.isPaused && this.didChangeWhilePaused)
    )
  }

  get canRedo() {
    return this.pointer < this.history.length - 1
  }

  /**
   * Pause the state's history.
   * @example
   * store.pause()
   * @public
   */
  pause = () => {
    this.isPaused = true
    this.notifySubscribers()
    return this
  }

  /**
   * Resume the state's history. If the state has changed while paused, this will create a new history entry.
   * @example
   * store.resume()
   * @public
   */
  resume = () => {
    if (this.didChangeWhilePaused) {
      // Commit an entry to the history
      const change = this.pausedHistory
      change[0].reverse()
      this.pausedHistory = [[], []]

      this.prev = this.current
      this.history = this.history.splice(0, this.pointer + 1)
      this.history.push(change)
      this.pointer++

      this.didChangeWhilePaused = false
    }

    this.isPaused = false
    this.notifySubscribers()
    return this
  }

  /**
   * Undo the state's history.
   * @example
   * store.undo()
   * @public
   */
  undo = () => {
    if (this.isPaused) {
      // Resume and undo anything that has changed since we paused
      if (this.didChangeWhilePaused) {
        const change = this.pausedHistory
        change[0].reverse()
        this.pausedHistory = [[], []]

        this.history = this.history.splice(0, this.pointer + 1)
        this.history.push(change)
        this.pointer = this.history.length - 1

        this.didChangeWhilePaused = false
      }

      this.isPaused = false
    }

    if (!this.canUndo) return

    const patches = this.history[this.pointer][0]

    this.pointer--
    this.prev = this.current
    this.current = applyPatches(this.current, patches)

    this.notifySubscribers()

    return this
  }

  /**
   * Redo the state's history. This will resume the history.
   * @example
   * store.redo()
   * @public
   */
  redo = () => {
    if (this.isPaused) {
      if (this.didChangeWhilePaused) {
        const change = this.pausedHistory
        change[0].reverse()
        this.pausedHistory = [[], []]

        this.history = this.history.splice(0, this.pointer + 1)
        this.history.push(change)
        this.pointer = this.history.length - 1

        this.didChangeWhilePaused = false
        return
      }

      this.isPaused = false
    }

    if (!this.canRedo) return

    this.pointer++

    const patches = this.history[this.pointer][1]

    this.prev = this.current
    this.current = applyPatches(this.current, patches)

    this.notifySubscribers()

    return this
  }

  // Subscribers

  getState = () => this.current

  listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  protected notifySubscribers() {
    this.listeners.forEach((l) => l())
  }

  // React

  useStore = () => {
    return useSyncExternalStore<T>(this.subscribe, this.getState)
  }

  useSelector = <K extends (state: T) => any>(selector: K) => {
    const fn = React.useCallback(() => selector(this.getState()), [selector])
    return useSyncExternalStore<ReturnType<K>>(this.subscribe, fn)
  }

  useStaticSelector = <K extends (state: T) => any>(selector: K) => {
    const [fn] = React.useState(() => () => selector(this.getState()))
    return useSyncExternalStore<ReturnType<K>>(this.subscribe, fn)
  }
}
