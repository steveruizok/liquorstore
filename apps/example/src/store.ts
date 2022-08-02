import * as React from "react"
import { nanoid } from "nanoid"
import { LiquorStore } from "liquorstore"

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

export class Store extends LiquorStore<IStore> {
  startPointingNode = (id: string) => {
    this.pause()
    this.mutate((s) => {
      s.selectedId = id
      s.status = "pointing"
    })
  }

  movePointingNode = (dx: number, dy: number, shiftKey: boolean) => {
    const { state } = this

    if (state.status === "pointing" && state.selectedId) {
      this.mutate((s) => {
        if (shiftKey) {
          for (let id in s.nodes) {
            s.nodes[id].x += dx
            s.nodes[id].y += dy
          }
        } else {
          const id = s.selectedId!
          s.nodes[id].x += dx
          s.nodes[id].y += dy
        }
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

// Create the initial state

const NODE_COUNT = 1000
const SIZE = 8
const PADDING = 2

const INITIAL_STATE: IStore = {
  status: "idle",
  selectedId: null,
  nodes: {},
}
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

// React stuff

export const storeContext = React.createContext({} as Store)

export const useStoreInitializer = () => {
  const [store] = React.useState(() => new Store(INITIAL_STATE))
  ;(window as any).store = store

  return store
}

export const useStoreContext = () => React.useContext(storeContext)
