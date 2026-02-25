const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

app.use(express.urlencoded({ extended: true }));

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const meliuzSlugs = {
    'Extrafarma': 'extrafarma', 'Pague Menos': 'cupom-pague-menos',
    'Drogasil': 'cupom-drogasil', 'Ultrafarma': 'ultrafarma'
};

async function extrairCashbackIA() {
    if (!genAI) return {};
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        // Busca o HTML das páginas de cashback (limitado para evitar timeout na Vercel)
        const promessas = Object.keys(meliuzSlugs).map(l => 
            fetch(`https://www.meliuz.com.br/desconto/${meliuzSlugs[l]}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            .then(r => r.text()).catch(() => "")
        );
        
        const htmls = await Promise.all(promessas);
        const combinedHTML = htmls.join('\n').substring(0, 20000);

        const prompt = `Analise o HTML e extraia a porcentagem exata de cashback HOJE para Extrafarma, Pague Menos, Drogasil e Ultrafarma. Ignore o termo "até". Retorne apenas JSON: {"Extrafarma": 2.5, "Pague Menos": 8, ...}. HTML: ${combinedHTML}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        return JSON.parse(text);
    } catch (e) {
        return { 'Extrafarma': 2.5, 'Pague Menos': 8, 'Drogasil': 3, 'Ultrafarma': 3 };
    }
}

async function buscarPrecos(medicamento, loja) {
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
    const cashInfo = await extrairCashbackIA();

    if (q) {
        const buscas = ['Extrafarma', 'Pague Menos', 'Drogaria Globo'].map(l => buscarPrecos(q, l));
        const resTotal = await Promise.all(buscas);
        const resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);

        resultados.forEach(r => {
            const pct = cashInfo[r.loja] || 0;
            const vC = (r.valor * (pct / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            finalHTML += `
                <div class="bg-white/5 p-8 rounded-[40px] border border-white/10 mb-8 shadow-2xl">
                    <div class="flex items-center gap-6 mb-6">
                        <img src="${r.imagem}" class="w-28 h-28 rounded-3xl bg-white object-contain p-2 flex-shrink-0">
                        <div class="flex-1">
                            <h3 class="text-2xl font-black text-slate-100 uppercase leading-tight">${r.nome}</h3>
                        </div>
                    </div>
                    <div class="flex justify-between items-center bg-black/40 p-6 rounded-[30px]">
                        <div>
                            <p class="text-lg font-black text-cyan-400 uppercase">${r.loja}</p>
                            <p class="text-base text-emerald-400 font-bold">+ ${vC} de volta (${pct}%)</p>
                            <p class="text-white font-mono text-5xl font-black mt-2">${r.preco}</p>
                        </div>
                        <a href="${r.link}" target="_blank" class="bg-cyan-600 px-10 py-6 rounded-3xl text-lg font-black text-white uppercase shadow-lg">COMPRAR</a>
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
        <title>Buscador FA</title>
        <style>body { font-size: 22px; } h1 { font-size: 4rem !important; }</style>
    </head>
    <body class="bg-slate-950 text-slate-100 p-6 font-sans">
        <div class="max-w-xl mx-auto">
            <header class="text-center py-16">
                <a href="/"><h1 class="font-black text-cyan-500 italic uppercase tracking-tighter leading-none mb-6">Buscador<br>Abreu 💊</h1></a>
                <p class="text-emerald-500 text-xl font-bold uppercase tracking-widest">Economia Real para sua Família</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-12 rounded-[50px] border border-white/10 shadow-2xl mb-16">
                <input type="text" name="remedio" value="${q}" placeholder="Qual o remédio hoje?" required
                       class="w-full bg-slate-800 p-10 rounded-3xl mb-10 border-4 border-white/5 focus:border-cyan-500 transition text-white text-3xl placeholder-slate-500 shadow-inner">
                
                <div class="flex justify-between mb-10 text-xl font-black text-cyan-400 underline">
                    <a href="https://www.drogasil.com.br" target="_blank">Drogasil →</a>
                    <a href="https://www.ultrafarma.com.br" target="_blank">Ultrafarma →</a>
                </div>
                
                <button type="submit" class="w-full bg-cyan-600 p-10 rounded-[35px] font-black uppercase text-2xl shadow-lg hover:bg-cyan-500 transition">🔍 BUSCAR AGORA</button>
            </form>

            <div class="space-y-4 mb-24">${finalHTML || (q ? '<p class="text-center">Nada encontrado nas redes automáticas.</p>' : '')}</div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
