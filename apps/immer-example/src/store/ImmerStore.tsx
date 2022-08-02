import React, { useSyncExternalStore } from "react"
import { nanoid } from "nanoid"
import {
  produce,
  enablePatches,
  applyPatches,
  Patch,
  PatchListener,
} from "immer"

enablePatches()

export interface INode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface IStore extends Record<string, any> {
  status: "idle" | "pointing"
  selectedId: string | null
  nodes: Record<string, INode>
}

class ImmerStore {
  constructor(initial: IStore) {
    this.prev = initial
    this.current = initial
  }

  prev: IStore
  current: IStore

  mutate = (fn: (state: IStore) => void) => {
    this.willChange()
    this.current = produce(this.current, fn, this.didChange)
  }

  // History

  pointer = -1
  history: Patch[][][] = []

  pausedHistory: Patch[][] = [[], []]

  isPaused = false

  didChangeWhilePaused = false

  get canUndo() {
    return (
      this.pointer >= 0 ||
      (this.pointer === 0 && this.isPaused && this.didChangeWhilePaused)
    )
  }

  get canRedo() {
    return this.pointer < this.history.length - 1
  }

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
    return useSyncExternalStore<IStore>(this.subscribe, this.getState)
  }

  useSelector = <K extends (state: IStore) => any>(selector: K) => {
    const fn = React.useCallback(() => selector(this.getState()), [selector])
    return useSyncExternalStore<ReturnType<K>>(this.subscribe, fn)
  }

  useStaticSelector = <K extends (state: IStore) => any>(selector: K) => {
    const [fn] = React.useState(() => () => selector(this.getState()))
    return useSyncExternalStore<ReturnType<K>>(this.subscribe, fn)
  }

  // ------

  // EVENTS

  startPointingNode = (id: string) => {
    this.pause()
    this.mutate((s) => {
      s.selectedId = id
      s.status = "pointing"
    })
  }

  movePointingNode = (dx: number, dy: number, shiftKey: boolean) => {
    const { current } = this

    if (current.status === "pointing" && current.selectedId) {
      if (shiftKey) {
        this.mutate((s) => {
          Object.values(s.nodes).forEach((n) => {
            n.x += dx
            n.y += dy
          })
        })

        return
      }

      this.mutate((s) => {
        const node = s.nodes[s.selectedId!]
        node.x += dx
        node.y += dy
      })
    }
  }

  stopPointingNode = () => {
    this.mutate((s) => {
      s.status = "idle"
      s.selectedId = null
    })

    this.resume()
  }

  startPointingCanvas = (x: number, y: number) => {
    const id = nanoid()

    this.pause()

    this.mutate((s) => {
      s.nodes[id] = { id, x: x - 50, y: y - 50, width: 100, height: 100 }
      s.selectedId = id
      s.status = "pointing"
    })
  }

  stopPointingCanvas = () => {
    this.mutate((s) => {
      s.status = "idle"
      s.selectedId = null
    })

    this.resume()
  }
}

export const storeContext = React.createContext({} as ImmerStore)

const INITIAL_STATE: IStore = {
  status: "idle",
  selectedId: null,
  nodes: {},
}

const NODE_COUNT = 1000
const SIZE = 8
const PADDING = 2

const rows = Math.floor(Math.sqrt(NODE_COUNT))

for (let i = 0; i < NODE_COUNT; i++) {
  const id = nanoid()
  INITIAL_STATE.nodes[id] = {
    id,
    x: 0 + (i % rows) * (SIZE + PADDING),
    y: 64 + Math.floor(i / rows) * (SIZE + PADDING),
    width: SIZE,
    height: SIZE,
  }
}

export const useStoreInitializer = () => {
  const [store] = React.useState(() => new ImmerStore(INITIAL_STATE))

  return store
}

export const useStoreContext = () => React.useContext(storeContext)
