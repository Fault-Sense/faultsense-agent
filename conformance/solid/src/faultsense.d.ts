/**
 * Type augmentation so Solid's JSX accepts the fs-* attributes used by
 * the Faultsense agent without complaints from strict JSX typings.
 * Template literal index signature lets any fs-assert-* attribute
 * through (including dynamic mutex variants like fs-assert-added-success).
 */
import "solid-js";

declare module "solid-js" {
  namespace JSX {
    interface DOMAttributes<T> {
      [key: `fs-${string}`]: string | undefined;
    }
  }
}
