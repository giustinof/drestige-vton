"use client"
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, X, Check } from 'lucide-react';

export default function SeasonsView() {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newSeason, setNewSeason] = useState('');
  
  // Stati per la modifica
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const fetchSeasons = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) setSeasons(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchSeasons();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newSeason.trim()) return;
    
    const { error } = await supabase.from('collections').insert([{ collection: newSeason.trim() }]);
    if (!error) {
      setNewSeason('');
      fetchSeasons();
    }
  };

  const handleUpdate = async (id) => {
    if (!editValue.trim()) return;
    const { error } = await supabase.from('collections').update({ collection: editValue.trim() }).eq('id', id);
    if (!error) {
      setEditingId(null);
      fetchSeasons();
    }
  };

  const handleDelete = async (id) => {
    if(confirm("Sei sicuro di voler eliminare questa stagione?")) {
      const { error } = await supabase.from('collections').delete().eq('id', id);
      if (!error) fetchSeasons();
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto pb-32 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100">
        <h2 className="text-xl font-bold text-zinc-900 mb-6">Gestione Stagioni</h2>
        
        {/* Form Aggiunta */}
        <form onSubmit={handleAdd} className="flex gap-2 mb-8">
          <input
            type="text"
            value={newSeason}
            onChange={(e) => setNewSeason(e.target.value)}
            placeholder="Es. Primavera/Estate 2024"
            className="flex-1 bg-zinc-50 border border-zinc-200 text-zinc-900 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
          />
          <button type="submit" className="bg-zinc-900 text-white px-5 rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center">
            <Plus size={20} />
          </button>
        </form>

        {/* Lista Stagioni */}
        {loading ? (
           <p className="text-center text-zinc-500 py-4">Caricamento stagioni...</p>
        ) : (
          <div className="space-y-3">
            {seasons.map((season) => (
              <div key={season.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                {editingId === season.id ? (
                  <div className="flex-1 flex gap-2 mr-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="flex-1 bg-white border border-zinc-300 rounded-lg px-3 py-2 outline-none"
                    />
                    <button onClick={() => handleUpdate(season.id)} className="p-2 bg-green-100 text-green-700 rounded-lg">
                      <Check size={18} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-2 bg-red-100 text-red-700 rounded-lg">
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-zinc-800">{season.collection}</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { setEditingId(season.id); setEditValue(season.collection); }}
                        className="p-2 text-zinc-400 hover:text-indigo-600 bg-white rounded-lg shadow-sm"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(season.id)}
                        className="p-2 text-zinc-400 hover:text-red-600 bg-white rounded-lg shadow-sm"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {seasons.length === 0 && <p className="text-center text-zinc-400 py-4">Nessuna stagione presente.</p>}
          </div>
        )}
      </div>
    </div>
  );
}