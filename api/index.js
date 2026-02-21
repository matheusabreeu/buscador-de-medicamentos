const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// Função para buscar no estoque digital da Extrafarma
async function buscarExtrafarma(medicamento) {
    try {
        const termo = encodeURIComponent(medicamento);
        // Link direto para a base de dados da Extrafarma
        const url = `https://www.extrafarma.com.br/api/catalog_system/pub/products/search?ft=${termo}`;
        
        const response = await fetch(url);
        if (!response.ok) return [];
        
        const produtos = await response.json();

        return produtos.map(p => {
            const item = p.items[0];
            const preco = item.sellers[0].commertialOffer.Price;
            return {
                nome: p.productName,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: p.link,
                imagem: item.images[0]?.imageUrl || ''
            };
        }).sort((a, b) => a.valor - b.valor); // Ordenação Econômica: Menor preço primeiro
    } catch (error) {
        return [];
    }
}

app.all('*', async (req, res) => {
    const remedio = req.body?.remedio || '';
    const resultados = remedio ? await buscarExtrafarma(remedio) : [];
    
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Busca Extrafarma</title>
    </head>
    <body class="bg-slate-950 text-white font-sans p-4">
        <div class="max-w-md mx-auto">
            <header class="text-center py-8">
                <h1 class="text-3xl font-bold text-blue-500">Extrafarma Online 💊</h1>
                <p class="text-slate-500 text-sm italic font-medium">Economia Familiar Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio (ex: Dorflex)..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition">
                    Pesquisar na Extrafarma
                </button>
            </form>

            <div class="space-y-4">
                ${resultados.length > 0 ? resultados.map(r => `
                    <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4">
                        ${r.imagem ? `<img src="${r.imagem}" class="w-16 h-16 rounded-lg bg-white object-contain">` : ''}
                        <div class="flex-1">
                            <h3 class="text-sm font-bold leading-tight text-slate-200">${r.nome}</h3>
                            <p class="text-green-400 font-mono text-xl mt-1 font-bold">${r.preco}</p>
                            <a href="${r.link}" target="_blank" class="text-[10px] text-blue-400 underline mt-2 block italic">Ver no site oficial →</a>
                        </div>
                    </div>
                `).join('') : (remedio ? '<p class="text-center text-red-400">Nenhum resultado encontrado. Tente outro nome.</p>' : '')}
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
