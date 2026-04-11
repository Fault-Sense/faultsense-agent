/**
 * Type augmentation so React JSX accepts the fs-* attributes used by
 * the Faultsense agent. Mirrors conformance/react/src/faultsense.d.ts.
 */
import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    [key: `fs-${string}`]: string | undefined;
  }
}
