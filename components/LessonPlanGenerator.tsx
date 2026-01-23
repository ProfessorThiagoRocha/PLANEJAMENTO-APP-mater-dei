
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { apiService } from '../services/apiService';
import { Evento } from '../types';

interface LessonPlanGeneratorProps {
  onVoltar: () => void;
}

declare const html2pdf: any;

const LessonPlanGenerator: React.FC<LessonPlanGeneratorProps> = ({ onVoltar }) => {
  const [tipo, setTipo] = useState('BIMESTRAL');
  const [professor, setProfessor] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [anoSerie, setAnoSerie] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [conteudos, setConteudos] = useState('');
  const [planoGerado, setPlanoGerado] = useState('');
  const [loading, setLoading] = useState(false);
  const [eventosCalendario, setEventosCalendario] = useState<Evento[]>([]);

  const [gradeAulas, setGradeAulas] = useState<Record<string, number>>({
    'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0, 'Sunday': 0
  });

  const tiposPlanos = ['SEMANAL', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'];
  const diasOpcoes = [
    { id: 'Monday', label: 'Segunda' }, 
    { id: 'Tuesday', label: 'Terça' }, 
    { id: 'Wednesday', label: 'Quarta' },
    { id: 'Thursday', label: 'Quinta' }, 
    { id: 'Friday', label: 'Sexta' }, 
    { id: 'Saturday', label: 'Sábado' }, 
    { id: 'Sunday', label: 'Domingo' }
  ];

  useEffect(() => {
    const fetchEventos = async () => {
      try {
        const data = await apiService.buscarDadosCalendario();
        setEventosCalendario(data);
      } catch (e) { console.error("Erro ao carregar eventos:", e); }
    };
    fetchEventos();
  }, []);

  const updateGrade = (dia: string, qtd: number) => {
    setGradeAulas(prev => ({ ...prev, [dia]: qtd }));
  };

  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const gerarPlano = async () => {
    const temDiaSelecionado = Object.values(gradeAulas).some(qtd => qtd > 0);
    if (!professor || !disciplina || !dataInicio || !dataFim || !conteudos || !temDiaSelecionado) {
      alert("Atenção: Preencha todos os campos obrigatórios e a grade semanal.");
      return;
    }
    setLoading(true);
    setPlanoGerado('');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const resumoGrade = Object.entries(gradeAulas)
        .filter(([_, q]) => q > 0)
        .map(([d, q]) => `${d}: ${q} aulas`).join(', ');
      
      const start = parseLocalDate(dataInicio);
      const end = parseLocalDate(dataFim);

      const eventosNoPeriodo = eventosCalendario.filter(ev => {
        const [d, m] = ev.data.split('/').map(Number);
        const dataEv = new Date(start.getFullYear(), m - 1, d);
        return dataEv >= start && dataEv <= end;
      }).map(ev => `${ev.data}: ${ev.legenda}`).join(' | ');

      const prompt = `
        Aja como Coordenador Pedagógico sênior. Gere um Planejamento ${tipo} DETALHADO.
        DADOS: Professor: ${professor} | Disciplina: ${disciplina} | Turma: ${anoSerie} | Grade: ${resumoGrade} | Conteúdos: ${conteudos}
        EVENTOS CALENDÁRIO: ${eventosNoPeriodo || 'Nenhum.'}

        REGRAS CRÍTICAS:
        1. DIA 02/02 (INÍCIO DO MÓDULO) É DIA LETIVO. Deve ter "Aula 1: Acolhida, Apresentação e Introdução à ${disciplina}".
        2. Liste TODAS as datas que têm aula conforme a grade.
        3. FORMATO COMPACTO (OBRIGATÓRIO):
           - DATA (Linha única em negrito, ex: 14/07)
           - • Aula X: Título Curto
           -   Tema: Descrição resumida.
           - Use "________________________________________" após cada data.
      `;

      const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: prompt });
      setPlanoGerado(response.text || '');
    } catch (error) { 
      console.error(error);
      alert("Erro na geração. Verifique sua conexão ou chave API."); 
    } finally { setLoading(false); }
  };

  const exportarPDF = () => {
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `Plano_${disciplina}_${anoSerie}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 3, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    const container = document.createElement('div');
    container.style.padding = "0";
    container.style.color = "#000";
    container.style.backgroundColor = "#fff";
    container.style.fontFamily = "'Arial', sans-serif";
    container.style.fontSize = "10pt";
    container.style.lineHeight = "1.3";
    
    let htmlContent = planoGerado
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/________________________________________/g, '<hr style="border:none; border-top: 0.5pt solid #ccc; margin: 8pt 0;"/>')
      .split('\n').map(line => {
        const trimmed = line.trim();
        if (/^\d{1,2}\/\d{1,2}/.test(trimmed)) {
          return `<div style="margin-top:10pt; font-weight:bold; font-size:11pt; page-break-after: avoid;">${trimmed}</div>`;
        }
        if (trimmed.startsWith('•') || trimmed.startsWith('*')) {
          return `<div style="margin-left:15pt; margin-top:3pt; page-break-inside: avoid;">${trimmed}</div>`;
        }
        if (trimmed.startsWith('Tema:')) {
          return `<div style="margin-left:25pt; font-size:9pt; color:#444; page-break-inside: avoid;">${trimmed}</div>`;
        }
        return `<div style="page-break-inside: avoid;">${line}</div>`;
      }).join('');

    container.innerHTML = `
      <div style="margin-bottom: 15pt; border-bottom: 2pt solid #0077cc; padding-bottom: 5pt;">
        <h1 style="margin: 0; font-size: 14pt; color: #0077cc; font-weight: bold;">📝 Planejamento ${tipo} – ${disciplina} – ${anoSerie}</h1>
        <div style="margin-top: 3pt; font-size: 9pt; color: #666;">
          <b>Professor:</b> ${professor} | <b>Datas:</b> ${dataInicio.split('-').reverse().join('/')} a ${dataFim.split('-').reverse().join('/')}
        </div>
      </div>
      <div>${htmlContent}</div>
    `;
    
    html2pdf().set(opt).from(container).save();
  };

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6 p-4 animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold italic tracking-tighter text-red-500">Gerador de Planos</h1>
        <button onClick={onVoltar} className="bg-gray-700 hover:bg-gray-800 px-6 py-2 rounded-xl font-bold text-sm shadow-lg">VOLTAR</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#2d0a0a] p-8 rounded-[40px] shadow-2xl border border-red-900/20">
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div>
            <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1">Tipo de Plano</label>
            <select className="input-field w-full p-4 mt-1 text-sm shadow-inner cursor-pointer" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {tiposPlanos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1">Professor(a)</label>
            <input type="text" className="input-field w-full p-4 mt-1 text-sm shadow-inner" value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="Nome do Professor..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1">Disciplina</label>
              <input type="text" className="input-field w-full p-4 mt-1 text-sm" value={disciplina} onChange={(e) => setDisciplina(e.target.value)} placeholder="Ex: História" />
            </div>
            <div>
              <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1">Turma</label>
              <input type="text" className="input-field w-full p-4 mt-1 text-sm" value={anoSerie} onChange={(e) => setAnoSerie(e.target.value)} placeholder="Ex: 8º C" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1">Início</label>
              <input type="date" className="input-field w-full p-4 mt-1 text-sm" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1">Término</label>
              <input type="date" className="input-field w-full p-4 mt-1 text-sm" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1">Grade Semanal (Aulas)</label>
          <div className="bg-black/30 p-6 rounded-3xl border border-red-900/10 space-y-3 shadow-inner">
            {diasOpcoes.map(dia => (
              <div key={dia.id} className="flex items-center justify-between group">
                <span className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors">{dia.label}</span>
                <input type="number" min="0" className="input-field w-14 text-center p-2 text-sm font-bold border-none" value={gradeAulas[dia.id]} onChange={(e) => updateGrade(dia.id, Math.max(0, parseInt(e.target.value) || 0))} />
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1">Ementa de Assuntos</label>
          <textarea className="input-field w-full p-5 mt-1 flex-grow font-sans text-xs resize-none leading-relaxed shadow-inner custom-scrollbar" value={conteudos} onChange={(e) => setConteudos(e.target.value)} placeholder="Descreva os temas que serão abordados no período..." />
          <button onClick={gerarPlano} disabled={loading} className={`btn-entrar p-5 w-full text-lg shadow-2xl flex items-center justify-center gap-4 transition-all ${loading ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:brightness-110 active:scale-95'}`}>
            {loading ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : 'GERAR PLANO'}
          </button>
        </div>
      </div>

      {planoGerado && (
        <div className="bg-[#2d0a0a] p-10 rounded-[40px] shadow-2xl mt-10 border border-red-900/20 animate-fade-in">
          <div className="flex justify-between items-center mb-8 border-b border-red-900/10 pb-6">
            <h2 className="text-2xl font-bold text-red-400">Planejamento Gerado</h2>
            <button onClick={exportarPDF} className="bg-red-700 hover:bg-red-800 px-8 py-3 rounded-2xl font-bold text-sm flex items-center gap-3 shadow-xl transition-all active:scale-95">
              SALVAR PDF
            </button>
          </div>
          <div className="bg-black/20 p-8 rounded-3xl border border-red-900/10 shadow-inner overflow-y-auto max-h-[800px] custom-scrollbar text-sm font-mono text-gray-200">
            {planoGerado.split('\n').map((line, i) => (
              <p key={i} className={`mb-1 whitespace-pre-wrap ${line.includes('________________') ? 'border-b border-white/5 my-4 pb-2' : ''}`}>
                {line.replace(/\*\*/g, '')}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LessonPlanGenerator;
