import { useEffect, useRef } from "react";

import { renderNullStateLogo } from "../../ui/logo";

export function useNullStateLogo() {
  const nullStateMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nullStateMessage = nullStateMessageRef.current;

    if (!nullStateMessage) {
      throw new Error('Element with id "nullStateMessage" not found');
    }

    renderNullStateLogo(nullStateMessage);
  }, []);

  return nullStateMessageRef;
}
