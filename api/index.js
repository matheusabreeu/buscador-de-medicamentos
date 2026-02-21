const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// Função para Extrafarma e Pague Menos (Sistema VTEX)
async function buscarVTEX(medicamento, loja) {
    try {
        const termo = encodeURIComponent(medicamento);
        const dominios = {
            'Extrafarma': 'www.extrafarma.com.br',
            'Pague Menos': 'www.paguemenos.com.br'
        };
        // Buscando 50 produtos (_from=0&_to=49)
        const url = `https://${dominios[loja]}/api/catalog_system/pub/products/search?ft=${termo}&_from=0&_to=49`;
        
        const response = await fetch(url);
        if (!response.ok) return [];
        const produtos = await response.json();

        return produtos.map(p => {
            const item = p.items[0];
            const preco = item.sellers[0].commertialOffer.Price;
            return {
                loja: loja,
                nome: p.productName,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: p.link,
                imagem: item.images[0]?.imageUrl || ''
            };
        });
    } catch (error) { return []; }
}

// Função específica para a Drogasil (Sistema RD-Saúde)
async function buscarDrogasil(medicamento) {
    try {
        const termo = encodeURIComponent(medicamento);
        // API de busca da Drogasil
        const url = `https://api-gateway-prod.raiadrogasil.com.br/search/v2/br/drogasil/search?term=${termo}&limit=50`;
        
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' } // Necessário para evitar bloqueio
        });
        if (!response.ok) return [];
        const data = await response.json();

        return data.results.products.map(p => ({
            loja: 'Drogasil',
            nome: p.name,
            preco: p.valueTo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            valor: p.valueTo,
            link: `https://www.drogasil.com.br/${p.urlKey}.html`,
            imagem: p.image
        }));
    } catch (error) { return []; }
}

app.all('*', async (req, res) => {
    const remedio = req.body?.remedio || '';
    let resultados = [];
    
    if (remedio) {
        // Busca paralela nas 3 frentes para maior agilidade
        const [resExtra, resPague, resDrogasil] = await Promise.all([
            buscarVTEX(remedio, 'Extrafarma'),
            buscarVTEX(remedio, 'Pague Menos'),
            buscarDrogasil(remedio)
        ]);
        
        // Unificação e Ordenação: Menor Preço Primeiro
        // Formula: Lista = sort(Extra ∪ Pague ∪ Drogasil)
        resultados = [...resExtra, ...resPague, ...resDrogasil]
            .sort((a, b) => a.valor - b.valor);
    }
    
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador Abreu - Saúde & Economia</title>
    </head>
    <body class="bg-slate-950 text-white font-sans p-4">
        <div class="max-w-md mx-auto">
            <header class="text-center py-8">
                <h1 class="text-3xl font-bold text-blue-500">Buscador Abreu 💊</h1>
                <p class="text-slate-500 text-sm italic font-medium">Extrafarma + Pague Menos + Drogasil</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition">
                    Comparar em 3 Redes
                </button>
            </form>

            <div class="space-y-4">
                ${resultados.length > 0 ? resultados.map(r => `
                    <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4 hover:border-blue-500 transition">
                        ${r.imagem ? `<img src="${r.imagem}" class="w-16 h-16 rounded-lg bg-white object-contain">` : ''}
                        <div class="flex-1">
                            <h3 class="text-[11px] font-bold leading-tight text-slate-200">${r.nome}</h3>
                            <div class="flex justify-between items-end mt-2">
                                <div>
                                    <p class="text-[9px] font-black ${r.loja === 'Extrafarma' ? 'text-blue-400' : (r.loja === 'Drogasil' ? 'text-green-500' : 'text-red-400')} uppercase">${r.loja}</p>
                                    <p class="text-green-400 font-mono text-xl font-bold">${r.preco}</p>
                                </div>
                                <a href="${r.link}" target="_blank" class="bg-slate-800 px-3 py-1 rounded-lg text-[10px] text-blue-400 hover:bg-slate-700">🛒 Site</a>
                            </div>
                        </div>
                    </div>
                `).join('') : (remedio ? '<p class="text-center text-red-400">Nenhum resultado nas farmácias.</p>' : '')}
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
