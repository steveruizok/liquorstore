import React from "react"
import { INode, Store, storeContext } from "../store"
import { CNode } from "./CNode"

export class CCanvas extends React.PureComponent {
  static contextType = storeContext as React.Context<Store>

  context = {} as React.ContextType<typeof storeContext>

  componentDidMount() {
    this.context.addListener(`nodes`, () => this.forceUpdate())
  }

  handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    this.context.startPointingCanvas(e.clientX, e.clientY)
  }

  handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    this.context.stopPointingCanvas()
  }

  handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    this.context.movePointingNode(e.movementX, e.movementY, e.shiftKey)
  }

  render() {
    const store = this.context

    return (
      <svg
        className="canvas"
        onPointerDown={this.handlePointerDown}
        onPointerUp={this.handlePointerUp}
        onPointerMove={this.handlePointerMove}
      >
        <text x={32} y={132} fontSize={100} fill="rgba(144, 144, 144, .5)">
          Liquor (ClassComponents)
        </text>
        {Object.keys(store.getState().nodes).map((id) => (
          <CNode key={id} id={id} />
        ))}
      </svg>
    )
  }
}
