export { };

declare global {
  interface Window {
    Faultsense?: {
      cleanup?: () => void;
    };
  }
}
