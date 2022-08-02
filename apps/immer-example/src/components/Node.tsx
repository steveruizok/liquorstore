import React from "react"
import { INode, useStoreContext } from "../store"

export const Node = React.memo(({ node }: { node: INode }) => {
  const store = useStoreContext()

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      store.startPointingNode(node.id)
      e.stopPropagation()
    },
    [store]
  )

  const handlePointerUp = React.useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      store.stopPointingNode()
      e.stopPropagation()
    },
    [store]
  )

  return (
    <rect
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      fill="rgba(144, 144, 144, .5)"
    />
  )
})
