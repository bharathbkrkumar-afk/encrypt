/// <reference types="vite/client" />

interface Window {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: {
            access_token?: string;
            error?: string;
            error_description?: string;
            expires_in?: number;
          }) => void;
          error_callback?: (err: any) => void;
        }) => {
          requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
        };
        revoke: (token: string, done?: () => void) => void;
      };
    };
  };
}
