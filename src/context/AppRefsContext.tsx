import { createContext, ParentComponent, useContext } from "solid-js";

export interface AppRefs {
  sidebarRef?: HTMLDivElement;
  sidebarHandleRef?: HTMLDivElement;
  nullStateMessageRef?: HTMLDivElement;
  topResultRef?: HTMLDivElement;
  terminalContainerRef?: HTMLDivElement;
}

const AppRefsContext = createContext<AppRefs>();

export const AppRefsProvider: ParentComponent<{ refs: AppRefs }> = (props) => {
  return (
    <AppRefsContext.Provider value={props.refs}>
      {props.children}
    </AppRefsContext.Provider>
  );
};

export function useAppRefs(): AppRefs {
  const context = useContext(AppRefsContext);
  if (!context) {
    throw new Error("useAppRefs must be used within an AppRefsProvider");
  }
  return context;
}
