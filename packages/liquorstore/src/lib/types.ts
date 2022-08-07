export interface DifferenceCreate {
  type: "CREATE"
  path: (string | number)[]
  value: any
  transient?: boolean
}

export interface DifferenceRemove {
  type: "REMOVE"
  path: (string | number)[]
  oldValue: any
  transient?: boolean
}

export interface DifferenceChange {
  type: "CHANGE"
  path: (string | number)[]
  value: any
  oldValue: any
  transient?: boolean
}

export type Difference = DifferenceCreate | DifferenceRemove | DifferenceChange
