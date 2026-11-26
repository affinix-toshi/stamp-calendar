import { useEffect, useMemo, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { getFirebase } from './firebase';
import { parseRoute, type Route } from './router';
import { toUserInfo } from './auth';
import { LoginScreen } from './components/LoginScreen';
import { InstallGuide } from './components/InstallGuide';
import { Toast } from './components/Toast';
import { RoomGate } from './components/RoomGate';

export function App() {
  const route = useMemo(() => parseRoute(window.location.pathname), []);
  if (route.name === 'demo') return <p>見本ルームは準備中です</p>;
  return <FamilyApp route={route} />;
}

function FamilyApp({ route }: { route: Route }) {
  const { auth, db } = useMemo(() => getFirebase('family'), []);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [redirectError, setRedirectError] = useState('');
  const [signOutError, setSignOutError] = useState('');

  useEffect(() => {
    // リダイレクト後のログイン結果を受け取る
    getRedirectResult(auth).catch((e) => {
      console.error(e);
      setRedirectError('ログインできませんでした。もう一度お試しください。');
    });
    return onAuthStateChanged(auth, setUser);
  }, [auth]);

  const info = useMemo(() => (user ? toUserInfo(user) : null), [user]);

  if (user === undefined) return <p className="loading">読み込み中…</p>;
  if (user === null || !info) return <LoginScreen auth={auth} notice={redirectError} />;
  return (
    <>
      <RoomGate
        db={db}
        user={info}
        route={route}
        onSignOut={() =>
          signOut(auth).catch((e) => {
            console.error(e);
            setSignOutError('ログアウトできませんでした。もう一度ためしてください。');
          })
        }
      />
      {signOutError && (
        <div className="toast-layer">
          <Toast message={signOutError} />
        </div>
      )}
      <InstallGuide />
    </>
  );
}
