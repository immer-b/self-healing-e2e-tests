import { createContext, useContext, type ReactNode } from 'react';
import type { UiVersion } from '../shared/uiVersion';
import { useUiVersion } from '../shared/useUiVersion';

/**
 * The staff rounds pages (queue and round) come in three layouts, like the self-healing demo apps,
 * switched at runtime through PUT /api/ui-version. Everything else in the hotel has one layout.
 * Defaults to v1 when the endpoint is unavailable.
 */
const UiVersionContext = createContext<UiVersion>(1);

export function HotelUiVersionProvider({ children }: { children: ReactNode }) {
  const { version = 1 } = useUiVersion();
  return <UiVersionContext.Provider value={version}>{children}</UiVersionContext.Provider>;
}

export const useHotelUiVersion = () => useContext(UiVersionContext);
