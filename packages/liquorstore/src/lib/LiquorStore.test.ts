import { LiquorStore } from "./LiquorStore"

let store: LiquorStore<{
  user: {
    name: string
    age: number
    children: string[]
    friends: { name: string }[]
  }
  fruits: string[]
}>

beforeEach(() => {
  store = new LiquorStore({
    user: {
      name: "Steve",
      age: 93,
      children: ["Donny", "Jojo"],
      friends: [],
    },
    fruits: ["apple"],
  })
})

it("top level array patch", () => {
  store.mutate((s) => {
    s.fruits = ["apple", "pear"]
  })
  expect(store.state.fruits).toMatchObject(["apple", "pear"])
})
