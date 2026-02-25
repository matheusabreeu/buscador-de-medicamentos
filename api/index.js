const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

app.use(express.urlencoded({ extended: true }));

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

const meliuzSlugs = {
    'Extrafarma': 'extrafarma', 'Pague Menos': 'cupom-pague-menos',
    'Drogasil': 'cupom-drogasil', 'Ultrafarma': 'ultrafarma'
};

// Função unificada para a IA ler TUDO de uma vez e evitar erro 500
async function processarDadosIA(remedio) {
    if (!model) return { cashbacks: {}, produtos: [] };

    try {
        // Busca simultânea dos sites de cashback e busca direta
        const sites = [
            ...Object.keys(meliuzSlugs).map(l => ({ loja: l, url: `https://www.meliuz.com.br/desconto/${meliuzSlugs[l]}` })),
            { loja: 'Drogasil', url: `https://www.drogasil.com.br/search?w=${remedio}` },
            { loja: 'Ultrafarma', url: `https://www.ultrafarma.com.br/busca?q=${remedio}` }
        ];

        const htmls = await Promise.all(sites.map(s => 
            fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            .then(res => res.text())
            .then(text => `--- LOJA: ${s.loja} ---\n${text.substring(0, 8000)}`) // Limita o tamanho para a IA
            .catch(() => "")
        ));

        const prompt = `
            Analise os fragmentos de HTML fornecidos e extraia os dados REAIS DE HOJE.
            1. Para Extrafarma, Pague Menos, Drogasil e Ultrafarma: encontre a porcentagem de cashback no Méliuz. Ignore "Até" se houver valor fixo.
            2. Para Drogasil e Ultrafarma: encontre o nome, preço (ex: 15.50) e link do remédio "${remedio}".
            
            Retorne APENAS um JSON puro (sem markdown):
            {
              "cashbacks": {"Extrafarma": 2.5, "Pague Menos": 8.0, "Drogasil": 3.0, "Ultrafarma": 3.0},
              "produtos": [{"loja": "Drogasil", "nome": "...", "valor": 10.50, "link": "...", "imagem": "..."}, ...]
            }
            HTML: ${htmls.join('\n')}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().replace(/```json|```/g, "").trim();
        return JSON.parse(responseText);
    } catch (e) {
        return { cashbacks: {}, produtos: [] };
    }
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
            processarDadosIA(q),
            Promise.all(['Extrafarma', 'Pague Menos', 'Drogaria Globo'].map(l => buscarVtex(q, l)))
        ]);

        const todosProdutos = [
            ...dadosIA.produtos.map(p => ({
                ...p, preco: p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            })),
            ...resultadosVtex.flat()
        ].sort((a, b) => a.valor - b.valor);

        todosProdutos.forEach(r => {
            const pct = dadosIA.cashbacks[r.loja] || 0;
            const vC = (r.valor * (pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            listaHTML += `
                <div class="bg-white/5 p-6 rounded-[30px] border border-white/10 mb-6 shadow-xl">
                    <div class="flex items-center gap-4 mb-4">
                        <img src="${r.imagem}" class="w-20 h-20 rounded-xl bg-white object-contain p-1">
                        <h3 class="text-lg font-bold text-white uppercase leading-tight">${r.nome}</h3>
                    </div>
                    <div class="flex justify-between items-center bg-black/20 p-4 rounded-2xl">
                        <div>
                            <p class="text-xs font-black text-cyan-400 uppercase">${r.loja}</p>
                            <p class="text-xs text-emerald-400 font-bold">+ ${vC} de volta (${pct}%)</p>
                            <p class="text-white font-mono text-3xl font-black mt-1">${r.preco}</p>
                        </div>
                        <a href="${r.link}" target="_blank" class="bg-cyan-600 px-6 py-4 rounded-xl text-xs font-black text-white uppercase">COMPRAR</a>
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
        <title>Buscador Abreu</title>
        <style>body { font-size: 18px; }</style>
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans">
        <div class="max-w-md mx-auto">
            <header class="text-center py-10">
                <a href="/"><h1 class="text-4xl font-black text-cyan-500 italic uppercase leading-none">Buscador<br>Abreu 💊</h1></a>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-8 rounded-[40px] border border-white/10 shadow-2xl mb-10">
                <input type="text" name="remedio" value="${q}" placeholder="Qual o remédio hoje?" required
                       class="w-full bg-slate-800 p-6 rounded-2xl mb-6 text-white text-xl border-2 border-white/5 focus:border-cyan-500 outline-none">
                <button type="submit" class="w-full bg-cyan-600 p-6 rounded-2xl font-black uppercase text-sm shadow-lg hover:bg-cyan-500 transition">🔍 BUSCAR PREÇOS REAIS</button>
            </form>

            <div class="space-y-4 mb-10">${listaHTML || (q ? '<p class="text-center opacity-50">A IA está processando os sites...</p>' : '')}</div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
