const express = require('express');
const axios = require('axios'); // Vamos usar axios para as requisições
const app = express();

app.use(express.urlencoded({ extended: true }));

// Função para buscar diretamente na API da Extrafarma
async function buscarExtrafarma(medicamento) {
    try {
        const termo = encodeURIComponent(medicamento);
        // Usamos a API do catálogo (VTEX) que é mais rápida e estável
        const url = `https://www.extrafarma.com.br/api/catalog_system/pub/products/search?ft=${termo}`;
        
        const response = await axios.get(url, { timeout: 10000 });
        const produtos = response.data;

        return produtos.map(p => {
            const item = p.items[0];
            const preco = item.sellers[0].commertialOffer.Price;
            return {
                nome: p.productName,
                preco: preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valor: preco,
                link: p.link,
                imagem: item.images[0].imageUrl
            };
        }).sort((a, b) => a.valor - b.valor); // Ordenação Econômica
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
        <title>Busca Extrafarma - Matheus Abreu</title>
    </head>
    <body class="bg-slate-950 text-white font-sans p-4">
        <div class="max-w-md mx-auto">
            <header class="text-center py-8">
                <h1 class="text-3xl font-bold text-blue-500">Extrafarma Online 💊</h1>
                <p class="text-slate-500 text-sm italic font-medium">Focado em economia para a família</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition">
                    Pesquisar na Extrafarma
                </button>
            </form>

            <div class="space-y-4">
                ${resultados.map(r => `
                    <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4">
                        <img src="${r.imagem}" class="w-16 h-16 rounded-lg bg-white object-contain" alt="Produto">
                        <div class="flex-1">
                            <h3 class="text-sm font-bold leading-tight">${r.nome}</h3>
                            <p class="text-green-400 font-mono text-xl mt-1">${r.preco}</p>
                            <a href="${r.link}" target="_blank" class="text-[10px] text-blue-400 underline">Ver no site oficial →</a>
                        </div>
                    </div>
                `).join('')}
                
                ${remedio && resultados.length === 0 ? '<p class="text-center text-red-400">Nenhum resultado real encontrado.</p>' : ''}
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
