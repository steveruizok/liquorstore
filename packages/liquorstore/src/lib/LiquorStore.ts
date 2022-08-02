import * as React from "react"
import { EventEmitter } from "eventemitter3"
import { diff } from "./diff"
import { Difference } from "./types"

export class LiquorStore<T extends Record<string, any>> extends EventEmitter {
  constructor(initial: T) {
    super()
    this.prev = initial
    this.current = initial
  }

  private prev: T
  private current: T
  private pointer = -1
  private history: Difference[][] = []
  private isPaused = false
  private didChangeWhilePaused = false
  private subscriptions = new Set<() => void>()

  // PRIVATE

  protected willChange() {
    if (this.isPaused) {
      if (!this.didChangeWhilePaused) {
        this.prev = this.current
        this.didChangeWhilePaused = true
      }
      return
    }

    this.prev = this.current
  }

  protected didChange(patch: Difference[]) {
    if (!this.isPaused) {
      this.history = this.history.splice(0, this.pointer + 1)
      this.history.push(patch)
      this.pointer++
    }

    this.notifySubscriptions(patch)
  }

  protected notifySubscriptions(patch?: Difference[]) {
    this.emit("change", this, patch)
    this.subscriptions.forEach((l) => l())
  }

  protected applyPatch(patch: Difference[], inverse?: boolean) {
    const refs = new Set<string | number>()
    const lastRefs = new Set<string | number>()
    const delQueue: (() => void)[] = []
    const next = Object.assign({}, this.current)

    // For each operation in the patch...
    for (const op of patch) {
      const { path } = op
      let secondToLastKey = path[path.length - 1]
      let lastKey = path[path.length - 1]

      lastRefs.add(path.slice(0, -1).join("."))

      let t = next as any

      // Create new object references for each step in the op's path,
      // unless we've already created an object reference for that step.
      for (let i = 0; i < path.length - 1; i++) {
        const step = path[i]
        const key = path.slice(0, i + 1).join(".")

        if (!refs.has(key)) {
          refs.add(key)
          t[step] = Object.assign({}, t[step])
        }

        t = t[step]
      }

      if (inverse) {
        // Apply the undo of each operation
        switch (op.type) {
          case "REMOVE": {
            t[lastKey] = op.oldValue
            break
          }
          case "CHANGE": {
            t[lastKey] = op.oldValue
            break
          }
          case "CREATE": {
            if (Array.isArray(t)) {
              t[lastKey as number] = REMOVE_SYMBOL
              delQueue.push(() => {
                if (secondToLastKey !== undefined)
                  t[secondToLastKey] = t[secondToLastKey].filter(
                    (x: any) => x !== REMOVE_SYMBOL
                  )
                else t.filter((x: any) => x !== REMOVE_SYMBOL)
              })
            } else delete t[lastKey]

            break
          }
        }
      } else {
        // Apply the operation
        switch (op.type) {
          case "CREATE": {
            t[lastKey] = op.value
            break
          }
          case "CHANGE": {
            t[lastKey] = op.value
            break
          }
          case "REMOVE": {
            if (Array.isArray(t)) {
              t[lastKey as number] = REMOVE_SYMBOL
              delQueue.push(() => {
                if (secondToLastKey !== undefined)
                  t[secondToLastKey] = t[secondToLastKey].filter(
                    (x: any) => x !== REMOVE_SYMBOL
                  )
                else t.filter((x: any) => x !== REMOVE_SYMBOL)
              })
            } else delete t[lastKey]

            break
          }
        }
      }
    }

    // emit events for each new ref?
    lastRefs.forEach((r) => this.emit(r as string, this))

    // Delete each item in the delete queue
    delQueue.forEach((t) => t())

    return next
  }

  // PUBLIC API

  subscribe = (listener: () => void) => {
    this.subscriptions.add(listener)
    return () => this.subscriptions.delete(listener)
  }

  /**
   * Set a new state by mutating the current state.
   *
   * @example
   * store.mutate(state => {
   *  state.age = 42
   *  state.settings.darkMode = true
   * })
   *
   * @param mutator A function that receives the current state and mutates it.
   * @public
   */

  mutate = (mutator: (state: T) => void) => {
    const draft = structuredClone(this.current)
    mutator(draft)
    const patch: Difference[] = diff(this.current, this.processState(draft))
    const next = this.applyPatch(patch)
    this.willChange()
    this.current = next
    this.didChange(patch)
  }

  /**
   * Run a command that mutates the state. Note that this command assumes that you will create new object references for any objects that are mutated.
   * @example
   * store.update(state => {
   *   state.user = { ...state.user, address: { ...state.user.address } }
   *   state.user.address.street = "123 Main St"
   * })
   */
  update = (fn: (state: T) => void) => {
    this.willChange()

    const tNext = Object.assign({}, this.current)

    fn(tNext)

    this.current = this.processState(tNext)

    const patch = diff(this.prev, this.current)

    this.didChange(patch)

    return this
  }

  /**
   * Pause the state's history.
   * @example
   * store.pause()
   * @public
   */
  pause = () => {
    this.isPaused = true
    this.notifySubscriptions()
    this.emit("pause", this)
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
      const change = diff(this.prev, this.current)
      this.prev = this.current
      this.history = this.history.splice(0, this.pointer + 1)
      this.history.push(change)
      this.pointer++
      this.didChangeWhilePaused = false
    }

    this.isPaused = false
    this.emit("resume")
    this.notifySubscriptions()
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
        this.history = this.history.splice(0, this.pointer + 1)
        this.history.push(diff(this.prev, this.current))
        this.pointer = this.history.length - 1
        this.didChangeWhilePaused = false
      }
      this.isPaused = false
    }

    if (!this.canUndo) return

    const patch = this.history[this.pointer]

    this.pointer--
    this.prev = this.current
    this.current = this.applyPatch(patch, true)

    this.emit("undo")
    this.notifySubscriptions(patch)

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
        this.history = this.history.splice(0, this.pointer + 1)
        this.history.push(diff(this.prev, this.current))
        this.pointer = this.history.length - 1
        this.didChangeWhilePaused = false
        return
      }

      this.isPaused = false
    }

    if (!this.canRedo) return

    this.pointer++

    const patch = this.history[this.pointer]

    this.prev = this.current
    this.current = this.applyPatch(patch)

    this.emit("redo")
    this.notifySubscriptions(patch)

    return this
  }

  /**
   * Process the state in some way before merging.
   * @public
   */
  processState(state: T) {
    return state
  }

  /**
   * Get the current state.
   * @returns boolean The current state.
   * @example
   * store.getState()
   * @public
   */
  getState = () => {
    return this.current
  }

  /**
   * Get whether the store's history is paused.
   * @returns boolean Whether the store's history is paused.
   * @example
   * store.getIsPaused()
   * @public
   */
  getIsPaused = () => {
    return this.isPaused
  }

  /**
   * Get whether the store can perform an undo.
   * @returns boolean Whether the store can perform an undo.
   * @example
   * store.getCanUndo()
   * @public
   */
  getCanUndo = () => {
    return this.canUndo
  }

  /**
   * Get whether the store can perform an redo.
   * @returns boolean Whether the store can perform a redo.
   * @example
   * store.getCanRedo()
   * @public
   */
  getCanRedo = () => {
    return this.canRedo
  }

  /**
   * Get whether the store is capable of undoing.
   * @public
   */
  get canUndo() {
    return (
      this.pointer >= 0 ||
      (this.pointer === 0 && this.isPaused && this.didChangeWhilePaused)
    )
  }

  /**
   * Get whether the store is capable of redoing.
   * @public
   */
  get canRedo() {
    return this.pointer < this.history.length - 1
  }

  get state() {
    return this.current
  }

  /* -------------------- // React -------------------- */

  useCanUndo = () => {
    return React.useSyncExternalStore(this.subscribe, this.getCanUndo)
  }

  useCanRedo = () => {
    return React.useSyncExternalStore(this.subscribe, this.getCanRedo)
  }

  useIsPaused = () => {
    return React.useSyncExternalStore(this.subscribe, this.getIsPaused)
  }

  useStore = () => {
    return React.useSyncExternalStore<T>(this.subscribe, this.getState)
  }

  useSelector = <K extends (state: T) => any>(selector: K) => {
    const fn = React.useCallback(() => selector(this.getState()), [selector])
    return React.useSyncExternalStore<ReturnType<K>>(this.subscribe, fn)
  }

  useStaticSelector = <K extends (state: T) => any>(selector: K) => {
    const [fn] = React.useState(() => () => selector(this.getState()))
    return React.useSyncExternalStore<ReturnType<K>>(this.subscribe, fn)
  }

  usePath = (path: string) => {
    const [_, ss] = React.useState(0)

    React.useEffect(() => {
      const forceUpdate = () => ss((s) => s + 1)
      this.addListener(path, forceUpdate)
      return () => void this.removeListener(path, forceUpdate)
    }, [])
  }
}

const REMOVE_SYMBOL = Symbol("remove")
