import { createContext, useContext } from "react"

export const StudioContext = createContext(null)
export function useStudio() {
  const value = useContext(StudioContext)
  if (!value)
    throw new Error("Studio pages must be inside the shared workspace.")
  return value
}
