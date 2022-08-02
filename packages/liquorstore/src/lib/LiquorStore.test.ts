import { LiquorStore } from "./LiquorStore"

let store: LiquorStore<{
  user: {
    name: string
    age: number
    children: string[]
    friends: { name: string }[]
  }
  fruits: string[]
  options: number[][]
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
    options: [[1, 0]],
  })
})

// Create

it("top level array patch", () => {
  store.mutate((s) => {
    s.fruits = ["apple", "pear"]
  })
  expect(store.state.fruits).toMatchObject(["apple", "pear"])
  store.undo()
  expect(store.state.fruits).toMatchObject(["apple"])
  store.redo()
  expect(store.state.fruits).toMatchObject(["apple", "pear"])
})

it("nested array patch", () => {
  store.mutate((s) => {
    s.options[0][0] = 2
    s.options[1] = [1, 1]
  })
  expect(store.state.options).toMatchObject([
    [2, 0],
    [1, 1],
  ])
  store.undo()
  expect(store.state.options).toMatchObject([[1, 0]])
})

it("array inside object", () => {
  store.mutate((s) => {
    s.user.children.push("Jenny")
  })
  expect(store.state.user).toMatchObject({
    children: ["Donny", "Jojo", "Jenny"],
  })
  store.undo()
  expect(store.state.user.children).toMatchObject(["Donny", "Jojo"])
  store.redo()
  expect(store.state.user.children).toMatchObject(["Donny", "Jojo", "Jenny"])
})

// Remove

it("top level array patch", () => {
  store.mutate((s) => {
    s.fruits.pop()
  })
  expect(store.state.fruits).toMatchObject([])
})

it("nested array patch", () => {
  store.mutate((s) => {
    s.options[0].pop()
  })
  expect(store.state.options).toMatchObject([[1]])
  store.undo()
  expect(store.state.options).toMatchObject([[1, 0]])
  store.redo()
  expect(store.state.options).toMatchObject([[1]])
})

it("array inside object", () => {
  store.mutate((s) => {
    s.user.children.pop()
  })
  expect(store.state.user).toMatchObject({
    children: ["Donny"],
  })
  store.undo()
  expect(store.state.user).toMatchObject({
    children: ["Donny", "Jojo"],
  })
  store.redo()
  expect(store.state.user).toMatchObject({
    children: ["Donny"],
  })
})
