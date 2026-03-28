import { assertionTriggerAttr } from "../config";

type ProcessElements = (elements: HTMLElement[], triggers: string[]) => void;

function processTrigger(trigger: "online" | "offline", processElements: ProcessElements): void {
  const elements = document.querySelectorAll(
    `[${assertionTriggerAttr}="${trigger}"]`
  );
  processElements(Array.from(elements) as HTMLElement[], [trigger]);
}

export function createConnectivityHandlers(processElements: ProcessElements) {
  const handleOnline = () => processTrigger("online", processElements);
  const handleOffline = () => processTrigger("offline", processElements);

  return { handleOnline, handleOffline };
}
