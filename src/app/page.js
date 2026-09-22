import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-between p-6 text-center">
      <div className="flex-1 flex flex-col items-center justify-center space-y-4 w-full mt-12">
        <div className="w-20 h-20 bg-black text-white rounded-3xl flex items-center justify-center text-3xl font-black mb-4">
          D.
        </div>
        <h1 className="text-4xl font-black tracking-tight text-black">Drestige Hub</h1>
        <p className="text-gray-500 text-lg max-w-xs">
          Scatta, categorizza e genera le foto per il catalogo in pochi secondi.
        </p>
      </div>
      
      <div className="w-full max-w-sm pb-8 space-y-4">
        <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-500 mb-6 border border-gray-100">
          Aggiungi questa pagina alla <strong>Home</strong> del tuo telefono per usarla come un'app nativa.
        </div>
        <Link 
          href="/app" 
          className="block w-full bg-black text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform"
        >
          Accedi all&apos;App
        </Link>
      </div>
    </div>
  );
}