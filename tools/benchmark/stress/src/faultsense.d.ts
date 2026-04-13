import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    [key: `fs-${string}`]: string | undefined;
  }
}

declare global {
  interface Window {
    __fsBenchStressTrigger?: boolean;
  }
}
