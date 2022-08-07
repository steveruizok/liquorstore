import { LiquorStore } from "./LiquorStore"
import { Difference } from "./types"

export class CommandChain<T extends Record<string, any>> {
  constructor(private store: LiquorStore<T>) {}

  private mutators: [(state: T) => void, boolean][] = []

  protected push = (mutator: (state: T) => void, history = true) => {
    this.mutators.push([mutator, history])
    console.log("pushing mutators", this.mutators.length)
    return this
  }

  run = () => {
    const { store, mutators } = this
    if (mutators.length === 0) return

    const current = store.state
    const draft = structuredClone(current)

    let history = false

    for (const [mutator, hist] of mutators) {
      if (hist && !history) history = true
      mutator(draft)
    }

    this.mutators = []

    const patch: Difference[] = store._diff(current, store.processState(draft))

    const next = store._applyPatch(patch)

    if (history) {
      store._willChange()
      store._current = next
      store._didChange(patch)
    } else {
      store._current = next
      store._notifySubscriptions(patch, false)
    }

    return this
  }
}
