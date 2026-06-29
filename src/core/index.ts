/** Public surface of the framework-agnostic core. */
export * from './model/types.js';
export { validateModel } from './model/validate.js';
export type { ModelProblem } from './model/validate.js';
export { generate } from './generator/generate.js';
export type { GenerateOptions } from './generator/generate.js';
export { parseScriptVersion, versionComment } from './script-version.js';
export { requiredExtensions } from './generator/extensions.js';
export { sieveString, sieveStringList } from './sieve/string.js';
export * from './managesieve/index.js';
export * from './parser/index.js';
