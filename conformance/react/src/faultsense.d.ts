/**
 * Type augmentation so JSX accepts the fs-* attributes used by the
 * Faultsense agent without complaints from React 19's stricter types.
 * Template literal index signature lets any fs-assert-whatever through
 * (including dynamic mutex variants like fs-assert-added-success).
 */
import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    [key: `fs-${string}`]: string | undefined;
  }
}
