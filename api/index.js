const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

app.use(express.urlencoded({ extended: true }));

// Initialize Gemini safely
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const meliuzSlugs = {
    'Extrafarma': 'extrafarma',
    'Pague Menos': 'cupom-pague-menos',
    'Drogasil': 'cupom-drogasil',
    'Ultrafarma': 'ultrafarma'
};

async function obterDadosDinâmicos(remedio, lojasSelecionadas) {
    if (!genAI) return { cashbacks: {}, produtos: [] };
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 1. Fetch data for selected stores and cashback links
    const storesToSearch = lojasSelecionadas.filter(l => l === 'Drogasil' || l === 'Ultrafarma');
    const results = await Promise.all([
        ...storesToSearch.map(l => fetch(`https://www.google.com/search?q=site:${l === 'Drogasil' ? 'drogasil.com.br' : 'ultrafarma.com.br'}+${remedio}`).then(r => r.text())),
        ...Object.keys(meliuzSlugs).map(l => fetch(`https://www.meliuz.com.br/desconto/${meliuzSlugs[l]}`).then(r => r.text()))
    ]);

    // 2. Ask Gemini to extract everything in ONE go to save time and prevent 500 errors
    const combinedHTML = results.join('\n').substring(0, 30000);
    const prompt = `
        Analise o HTML fornecido e extraia:
        1. O valor exato do cashback HOJE para: Extrafarma, Pague Menos, Drogasil e Ultrafarma. Ignore termos como "até" se houver um valor fixo no botão.
        2. Se houver resultados de busca para "${remedio}" na Drogasil ou Ultrafarma, pegue o nome, preço numérico e link.
        Retorne APENAS um JSON:
        {
          "cashbacks": {"NomeDaLoja": {"pct": 2.5, "label": "2,5%"}, ...},
          "produtos": [{"loja": "...", "nome": "...", "valor": 10.50, "link": "..."}]
        }
        HTML: ${combinedHTML}`;

    try {
        const aiResponse = await model.generateContent(prompt);
        const text = aiResponse.response.text().replace(/```json|```/g, "").trim();
        return JSON.parse(text);
    } catch (e) {
        return { cashbacks: {}, produtos: [] };
    }
}

app.all('*', async (req, res) => {
    const remedio = req.body.remedio || '';
    let selecionadas = req.body.lojas || ['Extrafarma', 'Pague Menos', 'Drogaria Globo'];
    if (!Array.isArray(selecionadas)) selecionadas = [selecionadas];

    let finalHTML = '';
    const { cashbacks, produtos } = remedio ? await obterDadosDinâmicos(remedio, selecionadas) : { cashbacks: {}, produtos: [] };

    if (remedio) {
        // Sort and build result cards
        produtos.sort((a, b) => a.valor - b.valor).forEach((p, i) => {
            const cash = cashbacks[p.loja] || { pct: 0, label: '0%' };
            const volta = (p.valor * (cash.pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            finalHTML += `
                <div class="bg-slate-900 p-6 rounded-3xl mb-4 border border-white/10">
                    <h3 class="text-white font-bold text-lg">${p.nome}</h3>
                    <p class="text-cyan-400 font-black text-xs uppercase">${p.loja}</p>
                    <div class="flex justify-between items-center mt-4">
                        <div>
                            <p class="text-white text-3xl font-mono font-black">R$ ${p.valor.toFixed(2)}</p>
                            <p class="text-emerald-400 text-xs font-bold">+ ${volta} de volta (${cash.label})</p>
                        </div>
                        <a href="${p.link}" target="_blank" class="bg-cyan-600 px-6 py-3 rounded-xl text-white font-bold">COMPRAR</a>
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
    </head>
    <body class="bg-slate-950 text-white p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-10">
                <h1 class="text-3xl font-black text-cyan-500 italic uppercase">Buscador de Medicamentos 💊</h1>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-8 rounded-[40px] border border-white/10 shadow-2xl mb-10">
                <input type="text" name="remedio" value="${remedio}" placeholder="Qual o remédio hoje?" required
                       class="w-full bg-slate-800 p-6 rounded-2xl mb-8 outline-none border-2 border-white/5 focus:border-cyan-500 transition text-white text-xl">
                <button type="submit" class="w-full bg-cyan-600 p-6 rounded-2xl font-black uppercase shadow-lg hover:bg-cyan-500 transition">🔍 BUSCAR PREÇOS REAIS</button>
            </form>

            <div class="space-y-4">${finalHTML || (remedio ? '<p class="text-center opacity-50">Nenhum resultado encontrado pela IA.</p>' : '')}</div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
