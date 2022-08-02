import { Difference } from "./types"

const richTypes: Record<string, boolean> = {
  Date: true,
  RegExp: true,
  String: true,
  Number: true,
}

export function diff(
  obj: Record<string, any> | any[],
  newObj: Record<string, any> | any[],
  _stack: Record<string, any>[] = []
): Difference[] {
  let diffs: Difference[] = []
  const isObjArray = Array.isArray(obj)

  for (const key in obj) {
    const oldObjValue = (obj as any)[key]
    const path = isObjArray ? +key : key

    // REMOVE
    if (!(key in newObj)) {
      diffs.push({
        type: "REMOVE",
        path: [path],
        oldValue: (obj as any)[key],
      })
      continue
    }

    const newObjValue = (newObj as any)[key]
    const areObjects =
      typeof oldObjValue === "object" && typeof newObjValue === "object"

    if (
      oldObjValue &&
      newObjValue &&
      areObjects &&
      !richTypes[Object.getPrototypeOf(oldObjValue).constructor.name]
    ) {
      // OBJ TO OBJ, NESTED DIFFS
      const nestedDiffs = diff(
        oldObjValue,
        newObjValue,
        _stack.concat([oldObjValue])
      )
      diffs.push.apply(
        diffs,
        nestedDiffs.map((difference) => {
          difference.path.unshift(path)
          return difference
        })
      )
    } else if (
      // CHANGE
      oldObjValue !== newObjValue &&
      !(
        areObjects &&
        (isNaN(oldObjValue)
          ? oldObjValue + "" === newObjValue + ""
          : +oldObjValue === +newObjValue)
      )
    ) {
      diffs.push({
        path: [path],
        type: "CHANGE",
        value: newObjValue,
        oldValue: oldObjValue,
      })
    }
  }

  // ARRAY
  const isNewObjArray = Array.isArray(newObj)

  for (const key in newObj) {
    if (!(key in obj)) {
      diffs.push({
        type: "CREATE",
        path: [isNewObjArray ? +key : key],
        value: (newObj as any)[key],
      })
    }
  }

  return diffs
}
