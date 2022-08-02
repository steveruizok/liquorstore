import React from "react"
import { useStoreContext } from "../store"
import { Node } from "./Node"

export function Canvas() {
  const store = useStoreContext()
  const nodes = store.useStaticSelector((s) => s.nodes)

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      store.startPointingCanvas(e.clientX, e.clientY)
    },
    [store]
  )

  const handlePointerUp = React.useCallback(() => {
    store.stopPointingCanvas()
  }, [store])

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      store.movePointingNode(e.movementX, e.movementY, e.shiftKey)
    },
    [store]
  )

  return (
    <svg
      className="canvas"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
    >
      <text x={32} y={132} fontSize={100} fill="rgba(144, 144, 144, .5)">
        Liquor (Hooks)
      </text>
      {Object.values(nodes).map((node) => (
        <Node key={node.id} node={node} />
      ))}
    </svg>
  )
}
