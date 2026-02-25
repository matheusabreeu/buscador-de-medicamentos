const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

app.use(express.urlencoded({ extended: true }));

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const meliuzSlugs = {
    'Extrafarma': 'extrafarma', 'Pague Menos': 'cupom-pague-menos',
    'Drogasil': 'cupom-drogasil', 'Ultrafarma': 'ultrafarma'
};

async function extrairDadosComIA(remedio, lojas) {
    if (!genAI) return { cashbacks: {}, produtos: [] };
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        // Busca simplificada para evitar o erro 500 (Internal Server Error)
        const promessas = Object.keys(meliuzSlugs).map(l => 
            fetch(`https://www.meliuz.com.br/desconto/${meliuzSlugs[l]}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            .then(r => r.text()).catch(() => "")
        );
        
        const htmls = await Promise.all(promessas);
        const combinedHTML = htmls.join('\n').substring(0, 25000);

        const prompt = `
            Aja como um analista de dados. Analise o HTML do Méliuz fornecido.
            1. Extraia o valor numérico de cashback HOJE para Extrafarma, Pague Menos, Drogasil e Ultrafarma.
            2. Ignore a palavra "até" se houver um valor maior disponível. Quero o valor real de ativação.
            Retorne APENAS um JSON:
            {"cashbacks": {"Extrafarma": {"pct": 2.5, "label": "2,5%"}, "Pague Menos": {"pct": 8, "label": "8%"}, ...}}
            HTML: ${combinedHTML}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        return JSON.parse(text);
    } catch (e) {
        return { cashbacks: { 'Extrafarma': { pct: 2.5, label: "2,5%" }, 'Pague Menos': { pct: 8, label: "8%" } } };
    }
}

async function buscarPrecosPadrao(medicamento, loja) {
    try {
        const dominios = { 'Extrafarma': 'www.extrafarma.com.br', 'Pague Menos': 'www.paguemenos.com.br', 'Drogaria Globo': 'www.drogariaglobo.com.br' };
        if (!dominios[loja]) return [];
        const res = await fetch(`https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(medicamento)}&_from=0&_to=5`);
        const data = await res.json();
        return data.map(p => ({
            loja, nome: p.productName, valor: p.items[0].sellers[0].commertialOffer.Price,
            preco: p.items[0].sellers[0].commertialOffer.Price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            link: p.link, imagem: p.items[0].images[0].imageUrl
        }));
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const q = req.body.remedio || '';
    let finalHTML = '';
    
    // Obter dados dinâmicos da IA
    const { cashbacks } = await extrairDadosComIA(q, []);

    if (q) {
        const buscas = ['Extrafarma', 'Pague Menos', 'Drogaria Globo'].map(l => buscarPrecosPadrao(q, l));
        const resTotal = await Promise.all(buscas);
        const resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);

        resultados.forEach(r => {
            const info = cashbacks[r.loja] || { pct: 0, label: '0%' };
            const vC = (r.valor * (info.pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            finalHTML += `
                <div class="bg-white/5 p-6 rounded-3xl border border-white/10 mb-6 shadow-2xl">
                    <div class="flex items-center gap-5 mb-4">
                        <img src="${r.imagem}" class="w-24 h-24 rounded-2xl bg-white object-contain p-2 flex-shrink-0">
                        <div class="flex-1">
                            <h3 class="text-xl font-bold text-slate-100 uppercase leading-tight">${r.nome}</h3>
                        </div>
                    </div>
                    <div class="flex justify-between items-center bg-black/30 p-5 rounded-2xl">
                        <div>
                            <p class="text-sm font-black text-cyan-400 uppercase">${r.loja}</p>
                            <p class="text-xs text-emerald-400 font-bold">+ ${vC} de volta (${info.label})</p>
                            <p class="text-white font-mono text-4xl font-black mt-1">${r.preco}</p>
                        </div>
                        <a href="${r.link}" target="_blank" class="bg-cyan-600 px-8 py-5 rounded-2xl text-sm font-black text-white uppercase shadow-lg">COMPRAR</a>
                    </div>
                </div>`;
        });
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador de Medicamentos</title>
        <style>
            body { font-size: 20px; }
            h3 { word-break: break-word; }
        </style>
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-12">
                <a href="/" class="inline-block hover:scale-105 transition-transform duration-200">
                    <h1 class="text-5xl font-black text-cyan-500 italic uppercase tracking-tighter leading-none mb-4">Buscador de<br>Remédios 💊</h1>
                </a>
                <p class="text-emerald-500 text-lg uppercase tracking-widest font-bold">Inteligência para a Família Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-8 rounded-[40px] border border-white/10 shadow-2xl mb-12">
                <input type="text" name="remedio" value="${q}" placeholder="Qual o remédio hoje?" required
                       class="w-full bg-slate-800 p-8 rounded-3xl mb-8 outline-none border-2 border-white/5 focus:border-cyan-500 transition text-white text-2xl">
                
                <div class="grid grid-cols-1 gap-y-6 mb-8 text-lg">
                    <div class="flex flex-col gap-2 opacity-50">
                        <label class="italic">⚠️ Drogasil e Ultrafarma: Acesse os links manuais abaixo devido a bloqueios nos sites.</label>
                    </div>
                    <div class="flex justify-between">
                        <a href="https://www.drogasil.com.br" target="_blank" class="text-cyan-400 underline font-black">Drogasil →</a>
                        <a href="https://www.ultrafarma.com.br" target="_blank" class="text-cyan-400 underline font-black">Ultrafarma →</a>
                    </div>
                </div>
                <button type="submit" class="w-full bg-cyan-600 p-8 rounded-3xl font-black uppercase text-xl shadow-lg hover:bg-cyan-500 transition">🔍 BUSCAR PREÇOS</button>
            </form>

            <div class="space-y-4 mb-20">${finalHTML || (q ? '<p class="text-center">Nenhum resultado nas redes automáticas.</p>' : '')}</div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
