const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

app.use(express.urlencoded({ extended: true }));

// Inicializa a IA do Google
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const meliuzSlugs = {
    'Extrafarma': 'extrafarma', 'Pague Menos': 'cupom-pague-menos',
    'Drogasil': 'cupom-drogasil', 'Ultrafarma': 'ultrafarma'
};

// IA ANALISA O CASHBACK
async function obterCashbackIA(loja) {
    const slug = meliuzSlugs[loja];
    if (!slug) return { pct: 0, label: '0%' };
    const url = 'https://www.meliuz.com.br/desconto/' + slug;
    
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await res.text();
        
        const prompt = `Extraia a porcentagem de cashback deste HTML do Méliuz. 
        Retorne APENAS um JSON: {"pct": 2.5, "label": "2,5%"}. 
        HTML: ${html.substring(0, 15000)}`; // Envia o topo do site para a IA

        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text().replace(/```json|```/g, ""));
    } catch (e) {
        const falls = { 'Extrafarma': '2,5%', 'Pague Menos': '8%', 'Drogasil': '3%', 'Ultrafarma': '3%' };
        return { pct: parseFloat(falls[loja]), label: falls[loja] };
    }
}

// IA ANALISA OS PREÇOS (DROGASIL E ULTRAFARMA)
async function buscarComIA(remedio, loja) {
    const urls = {
        'Drogasil': `https://www.drogasil.com.br/search?w=${remedio}`,
        'Ultrafarma': `https://www.ultrafarma.com.br/busca?q=${remedio}`
    };

    try {
        const res = await fetch(urls[loja], { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await res.text();

        const prompt = `Analise este HTML da farmácia ${loja} e encontre os 3 primeiros medicamentos: ${remedio}.
        Retorne APENAS um array JSON com: [{"nome": "...", "preco": 10.50, "link": "...", "imagem": "..."}].
        HTML: ${html.substring(0, 20000)}`;

        const result = await model.generateContent(prompt);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));
        
        return data.map(p => ({
            loja, nome: p.nome, preco: p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            valor: p.preco, link: p.link.startsWith('http') ? p.link : urls[loja].split('/search')[0] + p.link,
            imagem: p.imagem
        }));
    } catch (e) { return []; }
}

// BUSCA PADRÃO VTEX
async function buscarVTEX(medicamento, loja) {
    try {
        const dominios = { 'Extrafarma': 'www.extrafarma.com.br', 'Pague Menos': 'www.paguemenos.com.br', 'Drogaria Globo': 'www.drogariaglobo.com.br' };
        const url = `https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(medicamento)}&_from=0&_to=10`;
        const res = await fetch(url);
        const data = await res.json();
        return data.map(p => {
            const offer = p.items?.[0]?.sellers?.[0]?.commertialOffer;
            if (!offer?.Price || offer.Price <= 0) return null;
            return {
                loja, nome: p.productName, preco: offer.Price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: offer.Price, link: p.link, imagem: p.items[0].images[0].imageUrl
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const q = req.body.remedio || '';
    let selecionadas = req.body.lojas || ['Extrafarma', 'Pague Menos', 'Drogaria Globo', 'Drogasil', 'Ultrafarma'];
    if (!Array.isArray(selecionadas)) selecionadas = [selecionadas];

    // Carrega Cashbacks com IA
    const cashPromessas = ['Extrafarma', 'Pague Menos', 'Drogasil', 'Ultrafarma'].map(l => obterCashbackIA(l));
    const cashResults = await Promise.all(cashPromessas);
    const cashDict = { 'Extrafarma': cashResults[0], 'Pague Menos': cashResults[1], 'Drogasil': cashResults[2], 'Ultrafarma': cashResults[3], 'Drogaria Globo': { pct: 0, label: '0%' } };

    let resultados = [];
    if (q) {
        const buscas = selecionadas.map(l => (l === 'Drogasil' || l === 'Ultrafarma') ? buscarComIA(q, l) : buscarVTEX(q, l));
        const resTotal = await Promise.all(buscas);
        resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);
    }

    let listaHTML = '';
    resultados.forEach((r, idx) => {
        const info = cashDict[r.loja] || { pct: 0, label: '0%' };
        const vC = (r.valor * (info.pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const cor = r.loja === 'Extrafarma' ? 'text-cyan-400' : (r.loja === 'Drogaria Globo' ? 'text-orange-400' : 'text-red-400');
        
        listaHTML += `<div class="bg-white/5 p-6 rounded-3xl border border-white/10 flex flex-col gap-6 mb-8 shadow-2xl">
            <div class="flex items-center gap-6">
                <img src="${r.imagem}" class="w-24 h-24 rounded-2xl bg-white object-contain p-2 flex-shrink-0">
                <div class="flex-1">
                    ${idx === 0 ? '<span class="bg-emerald-500/20 text-emerald-400 text-xs px-3 py-1 rounded-full font-black uppercase mb-3 inline-block">Melhor Preço</span>' : ''}
                    <h3 class="text-lg font-black text-slate-100 uppercase leading-tight">${r.nome}</h3>
                </div>
            </div>
            <div class="flex justify-between items-center bg-black/30 p-5 rounded-2xl">
                <div>
                    <div class="flex flex-wrap items-center gap-3 mb-2">
                        <p class="text-sm font-black ${cor} uppercase">${r.loja}</p>
                        <span class="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-lg">+ ${vC} de volta (${info.label})</span>
                    </div>
                    <p class="text-white font-mono text-4xl font-black">${r.preco}</p>
                </div>
                <a href="${r.link}" target="_blank" class="bg-cyan-600 px-8 py-5 rounded-2xl text-sm font-black text-white uppercase shadow-lg hover:bg-cyan-500 transition active:scale-95">COMPRAR</a>
            </div>
        </div>`;
    });

    res.send(`<!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador Inteligente FA</title>
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-12"><h1 class="text-4xl font-black text-cyan-500 uppercase italic">Buscador Inteligente 💊</h1></header>
            <form method="POST" action="/" class="bg-slate-900 p-10 rounded-[40px] border border-white/10 shadow-2xl mb-16">
                <input type="text" name="remedio" value="${q}" placeholder="Qual o remédio hoje?" required class="w-full bg-slate-800 p-8 rounded-3xl mb-10 text-white text-2xl">
                <div class="grid grid-cols-1 gap-y-6 mb-10">
                    ${['Extrafarma', 'Pague Menos', 'Drogaria Globo', 'Drogasil', 'Ultrafarma'].map(l => `
                        <label class="flex items-center gap-4 text-lg cursor-pointer">
                            <input type="checkbox" name="lojas" value="${l}" ${selecionadas.includes(l) ? 'checked' : ''} class="w-8 h-8 rounded bg-slate-800 border-white/10 text-cyan-500"> ${l}
                        </label>
                    `).join('')}
                </div>
                <button type="submit" class="w-full bg-cyan-600 p-8 rounded-3xl font-black uppercase text-lg shadow-lg hover:bg-cyan-500 transition">🔍 BUSCAR AGORA</button>
            </form>
            <div class="space-y-4">${listaHTML}</div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
