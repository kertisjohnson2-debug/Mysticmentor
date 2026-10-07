import {createRoot} from 'react-dom/client';
import {useEffect, useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import App from './App.tsx';
import LandingPage from './components/LandingPage.tsx';
import {auth} from './firebase';
import './index.css';

const normalizePath = () => window.location.pathname.replace(/\/+$/, '') || '/';

// "/" (and the "/welcome" alias) is the public landing page for signed-out visitors.
// "/onboarding" and every other path load the app, which shows the existing onboarding when signed out.
function Root() {
  const path = normalizePath();
  const isLandingPath = path === '/' || path === '/welcome';
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!isLandingPath && path !== '/onboarding') return;
    // Don't leave visitors on a blank screen if auth is slow to report
    const fallback = window.setTimeout(() => setAuthReady(true), 2500);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSignedIn(!!user);
      setAuthReady(true);
      if (user && normalizePath() === '/onboarding') {
        window.history.replaceState(null, '', '/');
      }
    });
    return () => {
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  if (isLandingPath) {
    const skippedAuth = localStorage.getItem('celestial_skipped_auth') === 'true';
    if (!authReady) return <div className="min-h-screen bg-[#07041a]" />;
    return signedIn || skippedAuth ? <App /> : <LandingPage />;
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(<Root />);
