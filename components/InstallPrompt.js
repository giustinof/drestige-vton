"use client";

import { useState, useEffect } from "react";
import { X, Share, PlusSquare, Download } from "lucide-react";

export default function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
    
    // 1. Controlla se siamo già nell'app installata (Standalone mode)
    const isApp = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    setIsStandalone(isApp);

    if (isApp) return; // Se è già installata, non fare nulla

    // 2. Controlla se l'utente ha già chiuso il banner in passato
    const hasDismissed = localStorage.getItem("installPromptDismissed");
    if (hasDismissed) return;

    // 3. Rileva il sistema operativo
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Se è iOS, mostriamo subito le istruzioni manuali dopo un piccolo delay
    if (isIosDevice) {
      const timer = setTimeout(() => setShowPrompt(true), 1500);
      return () => clearTimeout(timer);
    }

    // 4. Logica per Android / Chrome Desktop
    const handleBeforeInstallPrompt = (e) => {
      // Previene il mini-banner nativo di Chrome
      e.preventDefault();
      // Salva l'evento per poterlo lanciare dopo
      setDeferredPrompt(e);
      // Mostra il nostro modale custom
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Mostra il prompt nativo di installazione di Android/Chrome
    deferredPrompt.prompt();
    
    // Aspetta la scelta dell'utente
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    // Svuota l'evento salvato
    setDeferredPrompt(null);
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
    // Salva nel localStorage per non infastidire più l'utente
    localStorage.setItem("installPromptDismissed", "true");
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center animate-in fade-in duration-300">
      <div className="relative w-full max-w-sm bg-[#121214] border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300 pb-safe">
        
        <button 
          onClick={dismissPrompt}
          className="absolute top-4 right-4 p-2 bg-zinc-800/50 text-zinc-400 rounded-full hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-4 mb-4">
          <img src="/icon-192x192.png" alt="V-TON App Icon" className="w-16 h-16 rounded-2xl shadow-lg border border-zinc-800" />
          <div>
            <h3 className="text-xl font-bold text-white">Installa V-TON</h3>
            <p className="text-sm text-zinc-400">Veloce, nativa, offline.</p>
          </div>
        </div>

        {isIOS ? (
          // ISTRUZIONI PER IOS
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 space-y-3">
            <p>Per installare l'app su iPhone o iPad:</p>
            <ol className="space-y-2">
              <li className="flex items-center gap-2">
                1. Tocca <Share size={18} className="text-blue-500" /> <b>Condividi</b> in basso
              </li>
              <li className="flex items-center gap-2">
                2. Scorri e tocca <PlusSquare size={18} className="text-zinc-400" /> <b>Aggiungi alla schermata Home</b>
              </li>
            </ol>
          </div>
        ) : (
          // PULSANTE PER ANDROID / DESKTOP
          <>
            <p className="text-sm text-zinc-400 mb-6">
              Aggiungi Drestige V-TON alla tua Home per un accesso rapido alla scansione e gestione del magazzino.
            </p>
            <button 
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all active:scale-95"
            >
              <Download size={20} /> Installa App Ora
            </button>
          </>
        )}
      </div>
    </div>
  );
}