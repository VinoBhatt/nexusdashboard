import { createContext, useContext } from "react";

export const DrawerContext = createContext<() => void>(() => {});

export function useDrawerToggle() {
  return useContext(DrawerContext);
}
