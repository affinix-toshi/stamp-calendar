import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

export type FirebaseTarget = 'family' | 'demo';

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Database;
}

/** 設定は公開してよい Web 用の値（.env.example 参照）。家族用と見本用で別のプロジェクトに接続する */
function configFor(target: FirebaseTarget) {
  const env = import.meta.env;
  if (target === 'family') {
    return {
      apiKey: env.VITE_FAMILY_API_KEY,
      authDomain: env.VITE_FAMILY_AUTH_DOMAIN,
      databaseURL: env.VITE_FAMILY_DATABASE_URL,
      projectId: env.VITE_FAMILY_PROJECT_ID,
      appId: env.VITE_FAMILY_APP_ID,
    };
  }
  return {
    apiKey: env.VITE_DEMO_API_KEY,
    authDomain: env.VITE_DEMO_AUTH_DOMAIN,
    databaseURL: env.VITE_DEMO_DATABASE_URL,
    projectId: env.VITE_DEMO_PROJECT_ID,
    appId: env.VITE_DEMO_APP_ID,
  };
}

export function getFirebase(target: FirebaseTarget): FirebaseHandles {
  const name = `stamp-${target}`;
  const app = getApps().some((a) => a.name === name)
    ? getApp(name)
    : initializeApp(configFor(target), name);
  return { app, auth: getAuth(app), db: getDatabase(app) };
}
