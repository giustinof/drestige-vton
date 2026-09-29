"use client"
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsInstalled(true);
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent) && !window.navigator.standalone) {
      setIsIOS(true);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-[#09090b] relative flex flex-col items-center justify-end pb-12 px-6 font-sans text-white overflow-hidden">
      
      {/* Sfondo: Immagine in alto che sfuma nel nero assoluto */}
      <div className="absolute top-0 left-0 right-0 h-[65vh] z-0 pointer-events-none">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/bg.jpg')" }}
        />
        {/* Gradiente verticale che fonde l'immagine col colore di fondo */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#09090b]/80 to-[#09090b]" />
      </div>

      {/* Contenitore UI (Tutto raggruppato in basso) */}
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        
        {/* Logo (Icona piccola in stile app) */}
        <div className="w-24 h-24 mb-8">
          <img 
            src="/logo.png" 
            alt="Drestige Logo" 
            className="w-full h-full object-contain drop-shadow-lg"
          />
        </div>

        {/* Testi primari */}
        <h1 className="text-[28px] font-bold text-white tracking-tight text-center mb-3">
          Drestige V-TON
        </h1>
        <p className="text-zinc-400 text-[15px] text-center leading-relaxed mb-10 px-2 font-medium">
          Da oggi, il tuo assistente AI da magazzino digitalizza il catalogo in pochi secondi.
        </p>

        {/* Area Call to Action con alone luminoso (Glow) */}
        <div className="w-full relative">
          {/* Effetto alone dietro il bottone */}
          <div className="absolute -inset-1 bg-white/20 blur-2xl rounded-full opacity-60 z-0 pointer-events-none"></div>

          <div className="relative z-10 space-y-4">
            
            {isInstalled ? (
              <Link 
                href="/app" 
                className="block w-full bg-white text-black font-semibold text-[17px] py-4 rounded-full text-center active:scale-[0.98] transition-transform"
              >
                Apri V-TON
              </Link>
            ) : (
              <>
                {isInstallable ? (
                  <button 
                    onClick={handleInstallClick}
                    className="w-full bg-white text-black font-semibold text-[17px] py-4 rounded-full active:scale-[0.98] transition-transform"
                  >
                    Installa l&apos;App
                  </button>
                ) : (
                  <Link 
                    href="/app" 
                    className="block w-full bg-white text-black font-semibold text-[17px] py-4 rounded-full text-center active:scale-[0.98] transition-transform"
                  >
                    Get Started
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        {/* Testi secondari e Disclaimer (Stile footer) */}
        <div className="mt-8 text-center flex flex-col gap-4">
          
          {/* Istruzioni iOS nascoste elegantemente se non installato */}
          {isIOS && !isInstalled && (
             <p className="text-[14px] text-white font-medium">
               Vuoi l&apos;app nativa? <span className="text-zinc-400 font-normal">Tocca Condividi e "Aggiungi alla Home"</span>
             </p>
          )}

          {!isIOS && !isInstallable && !isInstalled && (
             <p className="text-[14px] text-white font-medium">
               Accesso rapido? <Link href="/app" className="text-zinc-400 font-normal underline decoration-zinc-600 underline-offset-4">Accedi via web</Link>
             </p>
          )}

        </div>

      </div>
    </div>
  );
}