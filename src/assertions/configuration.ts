import { defaultConfiguration } from "../config";
import { Configuration } from "../types";
import { isURL } from "../utils/object";

type Validator = (v: any) => boolean;
const configValueRequired = (v: string | number | boolean) =>
  v !== undefined && v !== null;
const isValidConfigString = (v: string) =>
  typeof v === "string" && v.length > 0;
const isValidCopnfigNumber = (v: number) => typeof v === "number" && v > 0;
const isValidConfigBoolean = (v: boolean) => typeof v === "boolean";

const isValidCollectorURL = (v: string | Function) =>
  (typeof v === "string" && v.length > 0) || typeof v === "function";

const configValidator: Record<string, Validator[]> = {
  apiKey: [configValueRequired, isValidConfigString],
  releaseLabel: [configValueRequired, isValidConfigString],
  timeout: [isValidCopnfigNumber],
  collectorURL: [configValueRequired, isValidCollectorURL],
  debug: [isValidConfigBoolean],
};

export function setConfiguration(
  config: Partial<Configuration>
): Configuration {
  return Object.keys(defaultConfiguration).reduce((acc, key) => {
    const typedKey = key as keyof Configuration;
    if (acc[typedKey] === undefined) {
      acc[typedKey] = defaultConfiguration[typedKey] as any;
    }
    return acc;
  }, config) as Configuration;
}

export function isValidConfiguration(config: Configuration) {
  const keys = Object.keys(configValidator) as Array<keyof Configuration>;
  return keys.every((key) => {
    // Skip apiKey validation for non-URL collectors (functions or named collectors like "panel", "console")
    if (key === 'apiKey') {
      if (typeof config.collectorURL === 'function') return true;
      if (typeof config.collectorURL === 'string' && !isURL(config.collectorURL)) return true;
    }

    const validators: Validator[] = configValidator[key];
    const isValid = validators.every((validator) => validator(config[key]));
    if (!isValid) {
      // Note: Using console.error directly here since we don't have a logger instance
      // and this is a critical configuration error that should always be shown
      console.error(
        `[Faultsense]: Invalid configuration value for '${key}'`,
        config
      );
    }
    return isValid;
  });
}
