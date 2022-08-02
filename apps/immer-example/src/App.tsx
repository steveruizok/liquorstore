import { Canvas } from "./components/Canvas"
import { Controls } from "./components/Controls"
import { storeContext, useStoreInitializer } from "./store"

function App() {
  const store = useStoreInitializer()

  return (
    <storeContext.Provider value={store}>
      <Canvas />
      <Controls />
    </storeContext.Provider>
  )
}

export default App
