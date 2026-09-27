/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CLINIC_NAME?: string;
  readonly VITE_CLINIC_TAGLINE?: string;
  readonly VITE_CLINIC_PHONE?: string;
  readonly VITE_CLINIC_ZALO?: string;
  readonly VITE_CLINIC_EMAIL?: string;
  readonly VITE_CLINIC_ADDRESS?: string;
  readonly VITE_CLINIC_MAP_URL?: string;
  readonly VITE_CLINIC_FACEBOOK_URL?: string;
  readonly VITE_CLINIC_HOURS?: string;
  readonly VITE_CLINIC_SUNDAY_HOURS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
