import * as React from "react"
import { EventEmitter } from "eventemitter3"
import { Difference } from "./types"
import _cloneDeep from "lodash.clonedeep"

const structuredClone =
  typeof window !== "undefined" && (window as any).structuredClone
    ? window.structuredClone
    : _cloneDeep

export class LiquorStore<T extends Record<string, any>> extends EventEmitter {
  constructor(initial: T, transient?: RegExp) {
    super()
    this._prev = initial
    this._current = initial
    this._transient = transient
  }

  _prev: T
  _current: T
  _pointer = -1
  _didChangeWhilePaused = false
  _subscriptions = new Set<() => void>()
  readonly _transient?: RegExp

  history: Difference[][] = []
  isPaused = false

  // PRIVATE

  _willChange() {
    if (this.isPaused) {
      if (!this._didChangeWhilePaused) {
        this._prev = this._current
        this._didChangeWhilePaused = true
      }
      return
    }

    this._prev = this._current
  }

  _didChange(patch: Difference[]) {
    if (!this.isPaused) {
      this.history = this.history.splice(0, this._pointer + 1)
      this.history.push(patch)
      this._pointer++
    }

    this._notifySubscriptions(patch, true)
  }

  _notifySubscriptions(patch: Difference[], history: boolean) {
    this.emit("change", this, patch, history)
    this._subscriptions.forEach((l) => l())
  }

  _diff(
    obj: Record<string, any> | any[],
    newObj: Record<string, any> | any[],
    _stack: Record<string, any>[] = []
  ): Difference[] {
    let diffs: Difference[] = []
    const isObjArray = Array.isArray(obj)

    for (const key in obj) {
      const oldObjValue = (obj as any)[key]
      const path = isObjArray ? +key : key

      // REMOVE
      if (!(key in newObj)) {
        diffs.push({
          type: "REMOVE",
          path: [path],
          oldValue: (obj as any)[key],
        })
        continue
      }

      const newObjValue = (newObj as any)[key]
      const areObjects =
        typeof oldObjValue === "object" && typeof newObjValue === "object"

      if (
        oldObjValue &&
        newObjValue &&
        areObjects &&
        !richTypes[Object.getPrototypeOf(oldObjValue).constructor.name]
      ) {
        // OBJ TO OBJ, NESTED DIFFS
        const nestedDiffs = this._diff(
          oldObjValue,
          newObjValue,
          _stack.concat([oldObjValue])
        )
        diffs.push.apply(
          diffs,
          nestedDiffs.map((difference) => {
            difference.path.unshift(path)
            return difference
          })
        )
      } else if (
        // CHANGE
        oldObjValue !== newObjValue &&
        !(
          areObjects &&
          (isNaN(oldObjValue)
            ? oldObjValue + "" === newObjValue + ""
            : +oldObjValue === +newObjValue)
        )
      ) {
        diffs.push({
          path: [path],
          type: "CHANGE",
          value: newObjValue,
          oldValue: oldObjValue,
        })
      }
    }

    // ARRAY
    const isNewObjArray = Array.isArray(newObj)

    for (const key in newObj) {
      if (!(key in obj)) {
        diffs.push({
          type: "CREATE",
          path: [isNewObjArray ? +key : key],
          value: (newObj as any)[key],
        })
      }
    }

    const { _transient } = this

    if (_transient) {
      diffs.forEach((diff) => {
        if (_transient.test(diff.path.join("."))) {
          diff.transient = true
        }
      })
    }

    return diffs
  }

  _applyPatch(patch: Difference[], inverse?: boolean, skipTransient?: boolean) {
    const refs = new Set<string | number>()
    const lastRefs = new Set<string | number>()
    const delQueue: (() => void)[] = []
    const next = Object.assign({}, this._current)

    // For each operation in the patch...
    for (const op of patch) {
      const { path, transient } = op

      if (skipTransient && transient) continue

      let secondToLastKey = path[path.length - 2]
      let lastKey = path[path.length - 1]

      lastRefs.add(path.slice(0, -1).join("."))

      let p = next as any
      let t = next as any

      // Create new object references for each step in the op's path,
      // unless we've already created an object reference for that step.
      for (let i = 0; i < path.length - 1; i++) {
        const step = path[i]
        const key = path.slice(0, i + 1).join(".")

        if (!refs.has(key)) {
          refs.add(key)
          t[step] = Array.isArray(t[step])
            ? [...t[step]]
            : Object.assign({}, t[step])
        }

        p = t
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
                  p[secondToLastKey] = p[secondToLastKey].filter(
                    (x: any) => x !== REMOVE_SYMBOL
                  )
                else p.filter((x: any) => x !== REMOVE_SYMBOL)
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
                if (secondToLastKey !== undefined) {
                  p[secondToLastKey] = p[secondToLastKey].filter(
                    (x: any) => x !== REMOVE_SYMBOL
                  )
                } else {
                  t.filter((x: any) => x !== REMOVE_SYMBOL)
                }
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
    this._subscriptions.add(listener)
    return () => this._subscriptions.delete(listener)
  }

  /**
   * Set a new state by mutating the _current state.
   *
   * @example
   * store.mutate(state => {
   *  state.age = 42
   *  state.settings.darkMode = true
   * })
   *
   * @param mutator A function that receives the _current state and mutates it.
   * @public
   */

  mutate = (mutator: (state: T) => void, history = true) => {
    const draft = structuredClone(this._current)
    mutator(draft)
    const patch: Difference[] = this._diff(
      this._current,
      this.processState(draft)
    )
    const next = this._applyPatch(patch)

    if (history) {
      this._willChange()
      this._current = next
      this._didChange(patch)
    } else {
      this._current = next
      this._notifySubscriptions(patch, false)
    }

    return this
  }

  /**
   * Run a command that mutates the state. Note that this command assumes that you will create new object references for any objects that are mutated.
   * @example
   * store.update(state => {
   *   state.user = { ...state.user, address: { ...state.user.address } }
   *   state.user.address.street = "123 Main St"
   * })
   */
  update = (fn: (state: T) => void, history = true) => {
    this._willChange()
    const tNext = Object.assign({}, this._current)
    fn(tNext)
    this._current = this.processState(tNext)
    const patch = this._diff(this._prev, this._current)
    if (history) {
      this._didChange(patch)
    } else {
      this._notifySubscriptions(patch, history)
    }
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
    this._notifySubscriptions([], false)
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
    if (this._didChangeWhilePaused) {
      // Commit an entry to the history
      const change = this._diff(this._prev, this._current)
      this._prev = this._current
      this.history = this.history.splice(0, this._pointer + 1)
      this.history.push(change)
      this._pointer++
      this._didChangeWhilePaused = false
    }

    this.isPaused = false
    this.emit("resume")
    this._notifySubscriptions([], false)
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
      if (this._didChangeWhilePaused) {
        this.history = this.history.splice(0, this._pointer + 1)
        this.history.push(this._diff(this._prev, this._current))
        this._pointer = this.history.length - 1
        this._didChangeWhilePaused = false
      }
      this.isPaused = false
    }

    if (this.canUndo) {
      const patch = this.history[this._pointer]

      this._pointer--
      this._prev = this._current
      this._current = this._applyPatch(patch, true, true)

      this.emit("undo")
      this._notifySubscriptions(patch, false)
    }

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
      if (this._didChangeWhilePaused) {
        this.history = this.history.splice(0, this._pointer + 1)
        this.history.push(this._diff(this._prev, this._current))
        this._pointer = this.history.length - 1
        this._didChangeWhilePaused = false
        return
      }

      this.isPaused = false
    }

    if (this.canRedo) {
      this._pointer++

      const patch = this.history[this._pointer]

      this._prev = this._current
      this._current = this._applyPatch(patch, false, true)

      this.emit("redo")
      this._notifySubscriptions(patch, false)
    }

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
   * Get the _current state.
   * @returns boolean The _current state.
   * @example
   * store.getState()
   * @public
   */
  getState = () => {
    return this._current
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
      this._pointer >= 0 ||
      (this._pointer === 0 && this.isPaused && this._didChangeWhilePaused)
    )
  }

  /**
   * Get whether the store is capable of redoing.
   * @public
   */
  get canRedo() {
    return this._pointer < this.history.length - 1
  }

  get state() {
    return this._current
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
    }, [path])
  }

  useStaticPathSelector = <K extends (state: T) => any>(
    path: string,
    selector: K
  ) => {
    const [state, setState] = React.useState<ReturnType<K>>(
      selector(this.getState())
    )

    React.useEffect(() => {
      const forceUpdate = () => setState(selector(this.getState()))
      this.addListener(path, forceUpdate)
      return () => void this.removeListener(path, forceUpdate)
    }, [])

    return state
  }
}

const REMOVE_SYMBOL = Symbol("remove")

const richTypes: Record<string, boolean> = {
  Date: true,
  RegExp: true,
  String: true,
  Number: true,
}
