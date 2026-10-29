/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_AWS_REGION: string;
  readonly VITE_COGNITO_CUSTOMER_USER_POOL_ID: string;
  readonly VITE_COGNITO_CUSTOMER_CLIENT_ID: string;
  readonly VITE_COGNITO_REVIEWER_USER_POOL_ID: string;
  readonly VITE_COGNITO_REVIEWER_CLIENT_ID: string;
  readonly VITE_USE_MOCKS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
