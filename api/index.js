const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

app.use(express.urlencoded({ extended: true }));

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const meliuzSlugs = {
    'Extrafarma': 'extrafarma', 'Pague Menos': 'cupom-pague-menos',
    'Drogasil': 'cupom-drogasil', 'Ultrafarma': 'ultrafarma'
};

async function extrairDadosGeraisIA(remedio) {
    if (!genAI) return { cashbacks: {}, produtos: [] };
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Busca apenas o HTML essencial para não estourar o tempo da Vercel
    const urls = [
        ...Object.keys(meliuzSlugs).map(l => `https://www.meliuz.com.br/desconto/${meliuzSlugs[l]}`),
        `https://www.drogasil.com.br/search?w=${remedio}`,
        `https://www.ultrafarma.com.br/busca?q=${remedio}`
    ];

    try {
        const responses = await Promise.all(urls.map(url => 
            fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } })
            .then(res => res.text()).catch(() => "")
        ));

        const prompt = `
            ESQUEÇA VALORES ANTERIORES. Analise o HTML e extraia dados REAIS DE HOJE:
            1. Valor de cashback no Méliuz para Extrafarma, Pague Menos, Drogasil, Ultrafarma.
            2. Nome, preço (ex: 20.50) e link de 2 produtos de "${remedio}" na Drogasil e Ultrafarma.
            RETORNE APENAS JSON PURO:
            {"cash": {"Extrafarma": 2.5, "Pague Menos": 8, "Drogasil": 3, "Ultrafarma": 3},
             "prods": [{"loja": "Drogasil", "nome": "...", "valor": 15.0, "link": "...", "img": "..."}]}
            HTML: ${responses.join('\n').substring(0, 25000)}`;

        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text().replace(/```json|```/g, "").trim());
    } catch (e) { return { cash: {}, prods: [] }; }
}

async function buscarVtex(medicamento, loja) {
    const dominios = { 'Extrafarma': 'www.extrafarma.com.br', 'Pague Menos': 'www.paguemenos.com.br', 'Drogaria Globo': 'www.drogariaglobo.com.br' };
    try {
        const res = await fetch(`https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(medicamento)}&_from=0&_to=3`);
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
    let listaHTML = '';

    if (q) {
        const [dadosIA, resultadosVtex] = await Promise.all([
            extrairDadosGeraisIA(q),
            Promise.all(['Extrafarma', 'Pague Menos', 'Drogaria Globo'].map(l => buscarVtex(q, l)))
        ]);

        const todos = [
            ...dadosIA.prods.map(p => ({ ...p, preco: p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), imagem: p.img })),
            ...resultadosVtex.flat()
        ].sort((a, b) => a.valor - b.valor);

        todos.forEach(r => {
            const pct = dadosIA.cash[r.loja] || 0;
            const vC = (r.valor * (pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            listaHTML += `
                <div class="bg-white/5 p-6 rounded-[35px] border border-white/10 mb-8 shadow-2xl">
                    <div class="flex items-center gap-6 mb-4">
                        <img src="${r.imagem}" class="w-24 h-24 rounded-2xl bg-white object-contain p-2 flex-shrink-0">
                        <h3 class="text-xl font-black text-slate-100 uppercase leading-tight">${r.nome}</h3>
                    </div>
                    <div class="flex justify-between items-center bg-black/40 p-6 rounded-3xl">
                        <div>
                            <p class="text-sm font-black text-cyan-400 uppercase">${r.loja}</p>
                            <p class="text-xs text-emerald-400 font-bold">+ ${vC} de volta (${pct}%)</p>
                            <p class="text-white font-mono text-4xl font-black mt-2">${r.preco}</p>
                        </div>
                        <a href="${r.link}" target="_blank" class="bg-cyan-600 px-8 py-5 rounded-2xl text-sm font-black text-white">COMPRAR</a>
                    </div>
                </div>`;
        });
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador Abreu</title>
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-12"><a href="/"><h1 class="text-5xl font-black text-cyan-500 italic uppercase">Buscador Abreu 💊</h1></a></header>
            <form method="POST" action="/" class="bg-slate-900 p-8 rounded-[40px] border border-white/10 shadow-2xl mb-12">
                <input type="text" name="remedio" value="${q}" placeholder="Qual o remédio hoje?" required class="w-full bg-slate-800 p-8 rounded-3xl mb-8 text-white text-2xl border-none outline-none">
                <button type="submit" class="w-full bg-cyan-600 p-8 rounded-3xl font-black uppercase text-xl shadow-lg hover:bg-cyan-500 transition active:scale-95">🔍 BUSCAR PREÇOS REAIS</button>
            </form>
            <div class="space-y-4 mb-20">${listaHTML || (q ? '<p class="text-center opacity-50">Processando sites... aguarde 10 segundos.</p>' : '')}</div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
