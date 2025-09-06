import { config } from '@dotenvx/dotenvx';

export const baseEnv =
  config({
    path: `${import.meta.dirname}/../../../../.env`,
  }).parsed ?? {};

export const dynamicEnvValues = {
  CEB_NODE_ENV: baseEnv.CEB_DEV === 'true' ? 'development' : 'production',
  CEB_API_KEY: baseEnv.CEB_API_KEY || '', // Use CEB_ prefix
} as const;console.log('Base env:', baseEnv);
