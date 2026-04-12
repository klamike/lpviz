import { useEffect, type RefObject } from "react";

import { renderNullStateLogo } from "../../ui/logo";

export function useNullStateLogo(nullStateMessageRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const nullStateMessage = nullStateMessageRef.current;

    if (!nullStateMessage) {
      throw new Error('Element with id "nullStateMessage" not found');
    }

    renderNullStateLogo(nullStateMessage);
  }, []);
}
