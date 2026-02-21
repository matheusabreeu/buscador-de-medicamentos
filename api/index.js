const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

const getLinks = (remedio) => {
    const termo = encodeURIComponent(remedio);
    return [
        { loja: 'Extrafarma', url: `https://www.extrafarma.com.br/busca?q=${termo}`, cor: '#004899' },
        { loja: 'Pague Menos', url: `https://www.paguemenos.com.br/${termo}`, cor: '#e30613' },
        { loja: 'Drogasil', url: `https://www.drogasil.com.br/search?w=${termo}`, cor: '#008542' },
        { loja: 'Globo', url: `https://www.drogariasglobo.com.br/busca?q=${termo}`, cor: '#f39200' }
    ];
};

app.all('*', (req, res) => {
    const remedio = req.body?.remedio || '';
    const links = remedio ? getLinks(remedio) : [];
    
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Busca de Medicamentos</title>
    </head>
    <body class="bg-slate-950 text-white font-sans p-4">
        <div class="max-w-md mx-auto">
            <header class="text-center py-8">
                <h1 class="text-3xl font-bold text-blue-500">Remédio Barato 💊</h1>
                <p class="text-slate-500 text-sm italic font-medium">Economia Familiar Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl mb-8">
                <input type="text" name="remedio" value="${remedio}" placeholder="Nome do remédio..." required
                       class="w-full bg-slate-800 p-4 rounded-2xl mb-4 outline-none border border-transparent focus:border-blue-500 transition text-white">
                <button type="submit" class="w-full bg-blue-600 p-4 rounded-2xl font-bold hover:bg-blue-700 transition">
                    Gerar Links de Comparação
                </button>
            </form>

            <div class="space-y-3">
                ${links.map(l => `
                    <a href="${l.url}" target="_blank" 
                       class="flex items-center justify-between p-5 bg-slate-900 rounded-2xl border border-slate-800 hover:scale-[1.02] transition">
                        <span style="color: ${l.cor}" class="font-black text-lg">${l.loja}</span>
                        <span class="text-slate-500 text-sm font-medium">Pesquisar →</span>
                    </a>
                `).join('')}
            </div>
            ${links.length > 0 ? '<div class="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-xs text-blue-400 text-center">Clique em cada loja para ver os preços reais.</div>' : ''}
        </div>
    </body>
    </html>`);
});

module.exports = app;
